import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@insforge/sdk";
import { getInsforgeAdmin } from "@/lib/insforge/server";
import { env as serverEnv } from "@/lib/env";
import { canAssignRole, canManageAccess, isWorkspaceRole } from "@/features/workspace/permissions";
import { isSameOrigin, jsonSecurityError } from "@/lib/security/request";

export const runtime = "nodejs";

function env(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function getCurrentUser(request: NextRequest) {
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const cookieToken = request.cookies.get("insforge_access_token")?.value;
  const accessToken = bearerToken || cookieToken || null;
  if (!accessToken) return null;
  const client = createClient({
    baseUrl: env("NEXT_PUBLIC_INSFORGE_URL"),
    anonKey: env("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
    accessToken,
  });
  const { data, error } = await client.auth.getCurrentUser();
  if (error || !data?.user) return null;
  return data.user as { id: string; email?: string | null; profile?: Record<string, unknown> | null };
}

function profileValue(profile: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = profile?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function jsonError(error: unknown, status = 500) {
  return NextResponse.json(
    { message: error instanceof Error ? error.message : "Team request failed." },
    { status },
  );
}

async function getAccountEmail(userId: string) {
  try {
    const response = await fetch(`${serverEnv.insforgeUrl()}/api/auth/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${serverEnv.insforgeApiKey()}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { email?: string | null } | null;
    return body?.email?.trim() || null;
  } catch {
    return null;
  }
}

async function getActor(request: NextRequest, organizationId: string) {
  const user = await getCurrentUser(request);
  if (!user) return { user: null, role: null };
  const admin = getInsforgeAdmin();
  const { data, error } = await admin.database
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .limit(1);
  if (error) throw error;
  return { user, role: (data?.[0] as { role?: string } | undefined)?.role ?? null };
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) return jsonError(new Error("Missing workspace."), 400);
    const actor = await getActor(request, organizationId);
    if (!actor.user) return jsonError(new Error("Sign in again to continue."), 401);
    if (!actor.role) return jsonError(new Error("You do not have access to this workspace."), 403);

    const admin = getInsforgeAdmin();
    const [membersResult, requestsResult] = await Promise.all([
      admin.database
        .from("organization_members")
        .select("id,user_id,role,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      admin.database
        .from("organization_access_requests")
        .select("id,email,display_name,requested_role,status,review_notes,created_at")
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);
    if (membersResult.error) throw membersResult.error;
    if (requestsResult.error) throw requestsResult.error;

    const members = await Promise.all(
      ((membersResult.data ?? []) as Array<{ id: string; user_id: string; role: string; created_at: string }>).map(async (member) => {
        const [{ data: profile }, accountEmail] = await Promise.all([
          admin.auth.getProfile(member.user_id),
          getAccountEmail(member.user_id),
        ]);
        const flat = (profile ?? {}) as Record<string, unknown>;
        const nested = (flat.profile && typeof flat.profile === "object" ? flat.profile : {}) as Record<string, unknown>;
        const details = { ...flat, ...nested };
        const name = profileValue(details, "name", "displayName", "nickname") ?? "Team member";
        const email = member.user_id === actor.user?.id ? actor.user.email ?? accountEmail : accountEmail ?? profileValue(details, "email");
        return {
          ...member,
          name,
          email,
          avatarUrl: profileValue(details, "avatar_url", "avatarUrl"),
          title: profileValue(details, "title", "job_title"),
          bio: profileValue(details, "bio"),
          isCurrentUser: member.user_id === actor.user?.id,
        };
      }),
    );

    return NextResponse.json({
      members,
      requests: requestsResult.data ?? [],
      canManageAccess: ["owner", "admin"].includes(actor.role),
      currentUserId: actor.user.id,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();
    const body = (await request.json()) as { organizationId?: string; memberId?: string; role?: string };
    if (!body.organizationId || !body.memberId || !body.role) return jsonError(new Error("Missing member update details."), 400);
    const actor = await getActor(request, body.organizationId);
    if (!actor.user) return jsonError(new Error("Sign in again to continue."), 401);
    if (!canManageAccess(actor.role)) return jsonError(new Error("Only owners and admins can change team roles."), 403);
    if (!isWorkspaceRole(body.role)) return jsonError(new Error("Invalid team role."), 400);

    const admin = getInsforgeAdmin();
    const { data: target, error: targetError } = await admin.database
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", body.organizationId)
      .eq("id", body.memberId)
      .limit(1);
    if (targetError) throw targetError;
    if (!target?.length) return jsonError(new Error("Team member not found."), 404);
    if (!canAssignRole(actor.role, target[0].role, body.role)) {
      return jsonError(new Error("The workspace owner role is protected and cannot be reassigned here."), 403);
    }

    const { error } = await admin.database
      .from("organization_members")
      .update({ role: body.role })
      .eq("organization_id", body.organizationId)
      .eq("id", body.memberId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();
    const body = (await request.json()) as { organizationId?: string; memberId?: string };
    if (!body.organizationId || !body.memberId) return jsonError(new Error("Missing member removal details."), 400);
    const actor = await getActor(request, body.organizationId);
    if (!actor.user) return jsonError(new Error("Sign in again to continue."), 401);
    if (!canManageAccess(actor.role)) return jsonError(new Error("Only owners and admins can remove team members."), 403);

    const admin = getInsforgeAdmin();
    const { data: target, error: targetError } = await admin.database
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", body.organizationId)
      .eq("id", body.memberId)
      .limit(1);
    if (targetError) throw targetError;
    if (!target?.length) return jsonError(new Error("Team member not found."), 404);
    if (target[0].user_id === actor.user.id) return jsonError(new Error("You cannot remove your own workspace access."), 400);
    if (target[0].role === "owner") return jsonError(new Error("The workspace owner cannot be removed."), 400);

    const { error } = await admin.database.from("organization_members").delete().eq("organization_id", body.organizationId).eq("id", body.memberId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
