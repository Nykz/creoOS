import { WorkspaceShell } from "@/components/workspace-shell";
import { AuthGate } from "@/components/auth-gate";
import { WorkspaceAccessProvider } from "@/features/workspace/workspace-access";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceAccessProvider>
      <AuthGate>
        <WorkspaceShell>{children}</WorkspaceShell>
      </AuthGate>
    </WorkspaceAccessProvider>
  );
}
