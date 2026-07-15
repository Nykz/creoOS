import { WorkspaceShell } from "@/components/workspace-shell";
import { AuthGate } from "@/components/auth-gate";
import { WorkspaceAccessProvider } from "@/features/workspace/workspace-access";
import { getInitialWorkspaceUser } from "@/lib/insforge/current-user";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initialUser = await getInitialWorkspaceUser();
  return (
    <WorkspaceAccessProvider initialUser={initialUser}>
      <AuthGate>
        <WorkspaceShell>{children}</WorkspaceShell>
      </AuthGate>
    </WorkspaceAccessProvider>
  );
}
