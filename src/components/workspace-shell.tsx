"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CircleCheck,
  Handshake,
  LayoutDashboard,
  LogOut,
  Settings2,
  UsersRound,
  Video,
  WalletCards,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceAccess, signOutWorkspace } from "@/features/workspace/workspace-access";
import { canViewManagementModules } from "@/features/workspace/permissions";
import { NotificationBell } from "@/components/notification-bell";

const navigation = [
  ["/", "Overview", LayoutDashboard],
  ["/content", "Content", Video],
  ["/tasks", "Tasks", CircleCheck],
  ["/courses", "Courses", BookOpen],
  ["/sponsors", "Sponsors", Handshake],
  ["/affiliates", "Affiliates", WalletCards],
  ["/team", "Team", UsersRound],
  ["/analytics", "Analytics", BarChart3],
] as const;

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, loading, refresh, setActiveOrganizationId } = useWorkspaceAccess();
  const showManagementModules = state.kind === "ready" && canViewManagementModules(state.activeOrganization.role);
  const activeOrganizationLabel =
    state.kind === "pending"
      ? state.activeOrganization.name
      : state.kind === "ready" && state.activeOrganization.id
        ? state.activeOrganization.name
        : "No workspace selected";
  const activeOrganizationSlug =
    state.kind === "pending"
      ? state.activeOrganization.slug
      : state.kind === "ready" && state.activeOrganization.id
        ? state.activeOrganization.slug
        : "Create or join a company";
  const activeOrganizationRole =
    state.kind === "pending"
      ? state.activeOrganization.role
      : state.kind === "ready" && state.activeOrganization.id
        ? state.activeOrganization.role
        : "viewer";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-row" aria-label="CreoOS home">
          <div className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </div>
          <strong>CreoOS</strong>
        </Link>

        <section className="workspace-panel">
          <div className="workspace-copy">
            <span className="eyebrow">Workspace</span>
            <div className="workspace-switcher">
              <strong>{loading ? "Loading workspace" : activeOrganizationLabel}</strong>
              <span>{loading ? "Resolving membership" : activeOrganizationSlug}</span>
            </div>
            <div className="workspace-meta">
              <Badge variant="outline">{loading ? "Loading" : activeOrganizationRole}</Badge>
              {state.kind === "ready" && state.organizations.length > 1 && <span>{state.organizations.length} companies</span>}
            </div>
          </div>
          <NotificationBell />
        </section>

        {state.kind === "pending" && (
          <div className="pending-banner">
            <Badge variant="outline">Pending approval</Badge>
            <p>{state.activeOrganization.name} is waiting for admin verification.</p>
            <Link href="/onboarding" className="nav-item compact">
              Change company
            </Link>
          </div>
        )}

        {state.kind === "ready" && state.organizations.length > 1 && (
          <div className="org-switch-list">
            <span className="eyebrow">Switch company</span>
            {state.organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                className={`nav-item switch-item ${organization.id === state.activeOrganization.id ? "active" : ""}`}
                onClick={() => {
                  setActiveOrganizationId(organization.id);
                  void refresh({ force: true }).then(() => router.refresh());
                }}
              >
                <div className="switch-text">
                  <span>{organization.name}</span>
                  <small>{organization.slug}</small>
                </div>
                {organization.id === state.activeOrganization.id && <ChevronDown size={14} />}
              </button>
            ))}
          </div>
        )}

        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.filter(([href]) => showManagementModules || !["/sponsors", "/affiliates", "/analytics"].includes(href)).map(([href, label, Icon]) => (
            <Link key={href} href={href} className={`nav-item ${pathname === href ? "active" : ""}`}>
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <Link href="/settings" className={`nav-item settings-link ${pathname === "/settings" ? "active" : ""}`}>
          <Settings2 size={17} />
          <span>Settings</span>
        </Link>

        <Button
          type="button"
          variant="outline"
          className="nav-item logout-button"
          onClick={async () => {
            await signOutWorkspace();
            router.replace("/sign-in");
          }}
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </Button>
      </aside>
      <div className="workspace">{children}</div>
    </div>
  );
}
