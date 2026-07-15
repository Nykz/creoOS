import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";
import type { WorkspaceUser } from "@/features/workspace/workspace-access";

export async function getInitialWorkspaceUser(): Promise<WorkspaceUser | null> {
  try {
    const client = createServerClient({ cookies: await cookies() });
    const { data } = await client.auth.getCurrentUser();
    if (!data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      name: data.user.profile?.name?.trim() || data.user.email?.split("@")[0] || "Creator",
    };
  } catch {
    return null;
  }
}
