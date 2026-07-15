import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";
import { getInsforgeAdmin } from "@/lib/insforge/server";
import { isSameOrigin, jsonSecurityError } from "@/lib/security/request";

function env(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown; statusCode?: unknown };
    const message = typeof details.message === "string" ? details.message : "";
    const extra = typeof details.details === "string" ? details.details : typeof details.hint === "string" ? details.hint : "";
    if (message && extra && !message.includes(extra)) return `${message} (${extra})`;
    if (message) return message;
    if (typeof details.code === "string") return `${fallback} (${details.code})`;
  }
  return fallback;
}

function normalizeName(name: string | null | undefined, email: string | null | undefined) {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (email) return email.split("@")[0] || email;
  return "Creator";
}

async function getOrganizationBySlug(slug: string) {
  const admin = getInsforgeAdmin();
  const { data, error } = await admin.database
    .from("organizations")
    .select("id,name,slug")
    .eq("slug", slug)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { id: string; name: string; slug: string } | undefined) ?? null;
}

async function getAccessRequestRecipients(organizationId: string) {
  const admin = getInsforgeAdmin();
  const { data, error } = await admin.database
    .from("organization_members")
    .select("user_id,role")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"]);
  if (error) throw error;
  return (data ?? []) as Array<{ user_id: string; role: string }>;
}

async function createAccessRequestNotifications(input: {
  organizationId: string;
  organizationName: string;
  requesterName: string;
  requesterEmail: string | null;
  requestedRole: string;
}) {
  const recipients = await getAccessRequestRecipients(input.organizationId);
  if (recipients.length === 0) return [];

  const body = `${input.requesterName}${input.requesterEmail ? ` (${input.requesterEmail})` : ""} requested ${input.requestedRole} access for ${input.organizationName}. Open Team to review it.`;
  const admin = getInsforgeAdmin();
  const { data, error } = await admin.database
    .from("notifications")
    .insert(
      recipients.map((recipient) => ({
        user_id: recipient.user_id,
        organization_id: input.organizationId,
        type: "access_request_received",
        title: "Access request received",
        body,
        task_id: null,
      })),
    )
    .select("id,user_id");
  if (error) {
    console.error("Unable to create access request notifications.", error);
    return [];
  }
  return data ?? [];
}

export async function handleWorkspaceAccessRequest(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();

    const body = (await request.json().catch(() => null)) as { slug?: unknown; requestedRole?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!slug) return NextResponse.json({ message: "Enter a company code." }, { status: 400 });

    const organization = await getOrganizationBySlug(slug);
    if (!organization) return NextResponse.json({ message: "Unknown company code." }, { status: 404 });

    const requestedRole = body?.requestedRole === "editor" ? "editor" : "viewer";
    const client = createServerClient({
      baseUrl: env("NEXT_PUBLIC_INSFORGE_URL"),
      anonKey: env("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
      cookies: request.cookies,
    });

    const { data: current, error: userError } = await client.auth.getCurrentUser();
    if (userError || !current.user) {
      return NextResponse.json(
        { message: formatError(userError, "Sign in again before requesting access.") },
        { status: 401 },
      );
    }

    const { data, error } = await client.database.rpc("request_organization_access", {
      p_slug: slug,
      p_email: current.user.email ?? "",
      p_display_name: normalizeName(current.user.profile?.name, current.user.email ?? null),
      p_requested_role: requestedRole,
    });
    if (error) {
      return NextResponse.json({ message: formatError(error, "Could not request access.") }, { status: 400 });
    }

    const notifications = await createAccessRequestNotifications({
      organizationId: organization.id,
      organizationName: organization.name,
      requesterName: normalizeName(current.user.profile?.name, current.user.email ?? null),
      requesterEmail: current.user.email ?? null,
      requestedRole,
    });

    return NextResponse.json(
      { requestId: data, notificationCount: notifications.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not request access." },
      { status: 500 },
    );
  }
}
