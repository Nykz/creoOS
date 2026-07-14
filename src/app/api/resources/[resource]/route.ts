import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";
import { z } from "zod";
import { getInsforgeAdmin } from "@/lib/insforge/server";
import { isResourceKey, resources, type ResourceKey } from "@/features/resources/resource-config";
import { canManageRecords } from "@/features/workspace/permissions";
import { isSameOrigin, jsonSecurityError } from "@/lib/security/request";

export const runtime = "nodejs";

type FieldOption = { value: string; label: string };

class ResourceRouteError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function requiredPublicEnv(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function getCurrentUser(request: NextRequest) {
  const client = createServerClient({
    baseUrl: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_URL"),
    anonKey: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
    cookies: request.cookies,
  });

  const { data, error } = await client.auth.getCurrentUser();
  if (error || !data.user) return null;
  return data.user as { id: string };
}

async function assertMembership(userId: string, organizationId: string) {
  const admin = getInsforgeAdmin();
  const { data, error } = await admin.database
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (error) throw error;
  if (!data?.length) {
    throw new ResourceRouteError("You do not have access to this workspace.", 403);
  }
  return String((data[0] as { role?: string }).role ?? "viewer");
}

async function assertRecordPermission(userId: string, organizationId: string, resource: ResourceKey, payload?: Record<string, unknown>) {
  const role = await assertMembership(userId, organizationId);
  if (!canManageRecords(role)) {
    throw new ResourceRouteError("Your viewer role is read-only. Ask an admin for editor access to make changes.", 403);
  }
  if (resource === "tasks" && payload && Object.prototype.hasOwnProperty.call(payload, "assignee_id") && !["owner", "admin"].includes(role)) {
    throw new ResourceRouteError("Only owners and admins can assign tasks.", 403);
  }
  return role;
}

async function parseResource(params: Promise<{ resource: string }> | { resource: string }) {
  const resolved = await params;
  if (!isResourceKey(resolved.resource)) {
    throw new ResourceRouteError("Unknown resource.", 404);
  }
  return resources[resolved.resource];
}

function jsonError(error: unknown) {
  if (error instanceof ResourceRouteError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    const message = error.issues
      .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
      .join("; ");
    return NextResponse.json({ message: message || "Invalid record data." }, { status: 400 });
  }
  return NextResponse.json(
    { message: error instanceof Error ? error.message : "Request failed." },
    { status: 500 },
  );
}

async function getTaskOptions(admin: ReturnType<typeof getInsforgeAdmin>, organizationId: string) {
  const [membersResult, contentResult] = await Promise.all([
    admin.database
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    admin.database
      .from("content_items")
      .select("id, title")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (membersResult.error) throw membersResult.error;
  if (contentResult.error) throw contentResult.error;

  const uniqueMembers = Array.from(
    new Map(
      ((membersResult.data ?? []) as Array<{ user_id: string; role?: string | null }>).map((row) => [
        String(row.user_id),
        String(row.role ?? "viewer"),
      ]),
    ).entries(),
  );

  const memberOptions = await Promise.all(
    uniqueMembers.map(async ([userId, role]): Promise<FieldOption> => {
      const { data: profile } = await admin.auth.getProfile(userId);
      const flatProfile = (profile ?? {}) as Record<string, unknown>;
      const nestedProfile = (flatProfile.profile ?? {}) as Record<string, unknown>;
      const profileName =
        typeof flatProfile.nickname === "string"
          ? flatProfile.nickname
          : typeof flatProfile.displayName === "string"
            ? flatProfile.displayName
            : typeof flatProfile.name === "string"
              ? flatProfile.name
              : typeof nestedProfile.name === "string"
                ? nestedProfile.name
              : null;
      const label = profileName?.trim() || userId;
      return { value: userId, label: `${label} (${role})` };
    }),
  );

  const contentOptions = ((contentResult.data ?? []) as Array<{ id: string; title?: string | null }>).map((row) => ({
    value: String(row.id),
    label: String(row.title ?? row.id),
  }));

  return {
    memberOptions: memberOptions.sort((a, b) => a.label.localeCompare(b.label)),
    contentOptions,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ message: "Sign in again to continue." }, { status: 401 });

    const config = await parseResource(context.params);
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ message: "Missing workspace." }, { status: 400 });

    await assertMembership(user.id, organizationId);
    const admin = getInsforgeAdmin();
    const { data, error } = await admin.database
      .from(config.table)
      .select("*")
      .eq("organization_id", organizationId)
      .order(config.defaultOrderBy.column, { ascending: config.defaultOrderBy.ascending })
      .limit(200);

    if (error) throw error;

    const taskOptions = config.table === "tasks" ? await getTaskOptions(admin, organizationId) : null;
    return NextResponse.json({
      records: data ?? [],
      memberOptions: taskOptions?.memberOptions ?? [],
      contentOptions: taskOptions?.contentOptions ?? [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ message: "Sign in again to continue." }, { status: 401 });

    const config = await parseResource(context.params);
    const body = (await request.json()) as { organizationId?: string; payload?: unknown };
    if (!body.organizationId) return NextResponse.json({ message: "Missing workspace." }, { status: 400 });

    const parsed = config.schema.parse(body.payload ?? {});
    const resourceKey = (await context.params).resource;
    await assertRecordPermission(user.id, body.organizationId, resourceKey as ResourceKey, parsed as Record<string, unknown>);
    const admin = getInsforgeAdmin();
    const { data, error } = await admin.database
      .from(config.table)
      .insert([{ ...parsed, organization_id: body.organizationId, created_by: user.id }])
      .select();

    if (error) throw error;
    return NextResponse.json({ record: data?.[0] ?? null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ message: "Sign in again to continue." }, { status: 401 });

    const config = await parseResource(context.params);
    const body = (await request.json()) as { organizationId?: string; id?: string; payload?: unknown };
    if (!body.organizationId || !body.id) return NextResponse.json({ message: "Missing record or workspace." }, { status: 400 });

    const parsed = config.schema.partial().parse(body.payload ?? {});
    const resourceKey = (await context.params).resource;
    await assertRecordPermission(user.id, body.organizationId, resourceKey as ResourceKey, parsed as Record<string, unknown>);
    const admin = getInsforgeAdmin();
    const { data, error } = await admin.database
      .from(config.table)
      .update(parsed)
      .eq("id", body.id)
      .eq("organization_id", body.organizationId)
      .select();

    if (error) throw error;
    return NextResponse.json({ record: data?.[0] ?? null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ message: "Sign in again to continue." }, { status: 401 });

    const config = await parseResource(context.params);
    const body = (await request.json()) as { organizationId?: string; id?: string };
    if (!body.organizationId || !body.id) return NextResponse.json({ message: "Missing record or workspace." }, { status: 400 });

    const resourceKey = (await context.params).resource;
    await assertRecordPermission(user.id, body.organizationId, resourceKey as ResourceKey, undefined);
    const admin = getInsforgeAdmin();
    const { error } = await admin.database
      .from(config.table)
      .delete()
      .eq("id", body.id)
      .eq("organization_id", body.organizationId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
