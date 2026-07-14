"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceAccess } from "@/features/workspace/workspace-access";
import { canViewManagementModules } from "@/features/workspace/permissions";

export function WorkspaceRoleGate({ children }: { children: React.ReactNode }) {
  const { state, loading } = useWorkspaceAccess();

  if (loading || state.kind === "loading") {
    return <main className="module-page"><section className="loading-surface"><LoaderCircle size={20} className="spin" /> Checking workspace permissions</section></main>;
  }

  if (state.kind === "ready" && canViewManagementModules(state.activeOrganization.role)) return <>{children}</>;

  return (
    <main className="module-page">
      <section className="empty-surface role-denied">
        <div className="empty-icon"><LockKeyhole size={20} /></div>
        <h2>Admin access required</h2>
        <p>Sponsors, affiliates, and analytics are available only to workspace owners and admins.</p>
        <Button variant="outline" onClick={() => window.location.assign("/")}>Back to dashboard</Button>
      </section>
    </main>
  );
}
