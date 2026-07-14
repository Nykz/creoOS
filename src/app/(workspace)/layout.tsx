import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AuthGate } from "@/components/auth-gate";
import { WorkspaceAccessProvider } from "@/features/workspace/workspace-access";

async function getInitialUser() {
  const client = createServerClient({ cookies: await cookies() });
  const { data } = await client.auth.getCurrentUser();
  if (!data?.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: data.user.profile?.name?.trim() || data.user.email?.split("@")[0] || "Creator",
  };
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initialUser = await getInitialUser();
  return (
    <WorkspaceAccessProvider initialUser={initialUser}>
      <AuthGate>
        <WorkspaceShell>{children}</WorkspaceShell>
      </AuthGate>
    </WorkspaceAccessProvider>
  );
}
