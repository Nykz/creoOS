import { readFileSync } from "node:fs";
import { createClient } from "@insforge/sdk";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

if (!email || !password) {
  throw new Error("Set SMOKE_EMAIL and SMOKE_PASSWORD before running workspace-smoke.");
}

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function cookieValue(setCookies, name) {
  const cookie = setCookies.find((item) => item.startsWith(`${name}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split(";")[0].split("=").slice(1).join("="));
}

async function assertOk(response, label) {
  if (response.ok) return;
  throw new Error(`${label} failed with ${response.status}: ${await response.text()}`);
}

const env = readEnvFile(".env.local");

const signIn = await fetch(`${baseUrl}/api/auth/sign-in`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
await assertOk(signIn, "sign-in");

const setCookies = signIn.headers.getSetCookie?.() ?? [];
const accessToken = cookieValue(setCookies, "insforge_access_token");
const cookieHeader = setCookies.map((cookie) => cookie.split(";")[0]).join("; ");

if (!accessToken) {
  throw new Error("sign-in did not issue an access-token cookie.");
}

const me = await fetch(`${baseUrl}/api/auth/me`, {
  headers: { Cookie: cookieHeader },
});
await assertOk(me, "current-user");
const meBody = await me.json();

if (meBody.user?.email !== email) {
  throw new Error(`current-user returned ${meBody.user?.email ?? "no user"} instead of ${email}.`);
}

const client = createClient({
  baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
  anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
  accessToken,
});

const memberships = await client.database
  .from("organization_members")
  .select("organization_id, role, organizations(id, name, slug)")
  .eq("user_id", meBody.user.id);

if (memberships.error) throw memberships.error;
if (!memberships.data?.length) {
  throw new Error("No visible workspace memberships. RLS/session integration is not working.");
}

const organization = Array.isArray(memberships.data[0].organizations)
  ? memberships.data[0].organizations[0]
  : memberships.data[0].organizations;

if (!organization?.id) {
  throw new Error("Membership did not include organization details.");
}

const [content, tasks, courses, sponsors, affiliates] = await Promise.all([
  client.database.from("content_items").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
  client.database.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
  client.database.from("courses").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
  client.database.from("sponsorships").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
  client.database.from("affiliates").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
]);

for (const [label, result] of Object.entries({ content, tasks, courses, sponsors, affiliates })) {
  if (result.error) throw new Error(`${label} query failed: ${result.error.message}`);
}

const routes = ["/", "/tasks", "/content", "/courses", "/sponsors", "/affiliates", "/team", "/analytics", "/settings"];
const routeStatuses = [];

for (const route of routes) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "HEAD",
    headers: { Cookie: cookieHeader },
  });
  routeStatuses.push({ route, status: response.status });
  await assertOk(response, `route ${route}`);
}

console.log(
  JSON.stringify(
    {
      email,
      userId: meBody.user.id,
      organization,
      role: memberships.data[0].role,
      counts: {
        content: content.count ?? 0,
        tasks: tasks.count ?? 0,
        courses: courses.count ?? 0,
        sponsors: sponsors.count ?? 0,
        affiliates: affiliates.count ?? 0,
      },
      routes: routeStatuses,
    },
    null,
    2,
  ),
);
