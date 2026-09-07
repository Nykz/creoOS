"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, LoaderCircle, Mail, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectPicker } from "@/components/ui/select-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approveWorkspaceAccessRequest, rejectWorkspaceAccessRequest, useWorkspaceAccess } from "@/features/workspace/workspace-access";
import { rolePermissions } from "@/features/workspace/permissions";
import { getBrowserAccessToken } from "@/lib/insforge/browser";

type Member = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  isCurrentUser: boolean;
};

type RequestRow = {
  id: string;
  email: string;
  display_name: string;
  requested_role: string;
  status: string;
  created_at: string;
};

const roleOptions = ["admin", "editor", "viewer"];
const rolePickerOptions = roleOptions.map((role) => ({ value: role, label: role[0].toUpperCase() + role.slice(1) }));

function mergePendingRoleOverrides(rows: Member[], overrides: Record<string, string>) {
  return rows.map((row) => (overrides[row.id] ? { ...row, role: overrides[row.id] } : row));
}

function TeamSkeleton() {
  return (
    <section className="table-surface" aria-label="Loading team members">
      <div className="table-skeleton-head"><span /><span /><span /><span /></div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="table-skeleton-row" key={index}>
          <span className="skeleton-line wide" /><span className="skeleton-line" /><span className="skeleton-line short" /><span className="skeleton-line action" />
        </div>
      ))}
    </section>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
}

export default function TeamPage() {
  const { state, loading: accessLoading } = useWorkspaceAccess();
  const activeOrganizationId = state.kind === "ready" ? state.activeOrganization.id : "";
  const activeOrganization = state.kind === "ready" && state.activeOrganization.id ? state.activeOrganization : null;
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const pendingRoleOverrides = useRef<Record<string, string>>({});

  const load = useCallback(async (organizationId: string) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const accessToken = getBrowserAccessToken();
      const response = await fetch(`/api/team?organizationId=${encodeURIComponent(organizationId)}`, {
        headers: {
          Accept: "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as { members?: Member[]; requests?: RequestRow[]; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Could not load team records.");
      if (version !== loadVersion.current) return;
      setMembers(mergePendingRoleOverrides(body?.members ?? [], pendingRoleOverrides.current));
      setRequests(body?.requests ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load team records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || state.kind !== "ready" || !activeOrganizationId) return;
    queueMicrotask(() => void load(activeOrganizationId));
  }, [accessLoading, activeOrganizationId, load, state.kind]);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => [member.name, member.email, member.role, member.title].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [members, search]);

  async function updateMember(memberId: string, role: string) {
    const previousRole = members.find((member) => member.id === memberId)?.role;
    loadVersion.current += 1;
    setBusyId(memberId);
    setError("");
    pendingRoleOverrides.current = { ...pendingRoleOverrides.current, [memberId]: role };
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role } : member));
    try {
      const accessToken = getBrowserAccessToken();
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        cache: "no-store",
        body: JSON.stringify({ organizationId: activeOrganizationId, memberId, role }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Could not update team role.");
      setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role } : member));
    } catch (cause) {
      delete pendingRoleOverrides.current[memberId];
      if (previousRole) setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role: previousRole } : member));
      setError(cause instanceof Error ? cause.message : "Could not update team role.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(memberId: string) {
    if (!window.confirm("Remove this member from the workspace?")) return;
    setBusyId(memberId);
    try {
      const accessToken = getBrowserAccessToken();
      const response = await fetch("/api/team", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ organizationId: activeOrganizationId, memberId }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Could not remove team member.");
      delete pendingRoleOverrides.current[memberId];
      setMembers((current) => current.filter((member) => member.id !== memberId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove team member.");
    } finally {
      setBusyId(null);
    }
  }

  if (accessLoading || state.kind === "loading") return <main className="module-page"><header className="module-header"><div><span className="eyebrow">CreoOS workspace</span><h1>Team</h1><p>Manage people, roles, and access across this workspace.</p></div></header><TeamSkeleton /></main>;
  if (state.kind === "pending") return <main className="module-page"><header className="module-header"><div><span className="eyebrow">CreoOS workspace</span><h1>Team</h1><p>Manage people, roles, and access across this workspace.</p></div></header><section className="empty-surface"><h2>Team access is waiting on approval</h2><p><strong>{state.activeOrganization.name}</strong> has not approved this account yet, so team records stay locked until a verified admin reviews the request.</p><Badge variant="outline">Pending approval</Badge></section></main>;
  if (!activeOrganizationId) return <main className="module-page"><header className="module-header"><div><span className="eyebrow">CreoOS workspace</span><h1>Team</h1><p>Manage people, roles, and access across this workspace.</p></div></header><section className="empty-surface"><h2>Choose a verified company first</h2><p>Team access appears once you create or join a workspace that an admin has approved.</p></section></main>;

  return (
    <main className="module-page">
      <header className="module-header">
        <div><span className="eyebrow">CreoOS workspace</span><h1>Team</h1><p>Manage people, roles, and access across this workspace.</p></div>
        <div className="module-header-meta"><Badge variant="outline"><ShieldCheck size={14} /> {activeOrganization?.role ?? "viewer"}</Badge><span>{members.length} members</span></div>
      </header>

      {error && <section className="error-banner"><div><h2>Team data needs attention</h2><p>{error}</p></div><Button variant="outline" onClick={() => void load(activeOrganizationId)}>Try again</Button></section>}

      <section className="team-summary-grid">
        <div><span>Workspace</span><strong>{activeOrganization?.name}</strong><small>{activeOrganization?.slug}</small></div>
        <div><span>Members</span><strong>{members.length}</strong><small>Verified access</small></div>
        <div><span>Pending review</span><strong>{requests.length}</strong><small>Access requests</small></div>
      </section>

      <section className="section-heading team-section-heading"><div><span className="eyebrow">Directory</span><h2>Team members</h2></div><Badge variant="outline">{state.kind === "ready" && state.canManageAccess ? "Admin controls enabled" : "View only"}</Badge></section>
      <section className="role-permissions" aria-label="Workspace role permissions">
        <div className="section-heading"><div><span className="eyebrow">Access model</span><h2>Role permissions</h2></div><ShieldCheck size={18} /></div>
        <div className="role-permissions-grid">{rolePermissions.map((permission) => <article key={permission.role}><strong>{permission.role}</strong><span>{permission.summary}</span><p>{permission.detail}</p></article>)}</div>
      </section>
      <div className="module-toolbar"><label className="search-box"><Mail size={16} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, role" /></label></div>

      {loading ? <TeamSkeleton /> : (
        <section className="table-surface">
          <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead><TableHead>Profile</TableHead><TableHead>Joined</TableHead><TableHead className="actions-head">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? <TableRow><TableCell colSpan={5}><p className="table-empty">No members match this search.</p></TableCell></TableRow> : filteredMembers.map((member) => {
                const canManage = state.kind === "ready" && state.canManageAccess && !member.isCurrentUser && member.role !== "owner";
                return <TableRow key={member.id}>
                  <TableCell><div className="member-identity"><div className="member-avatar">{member.avatarUrl ? <Image src={member.avatarUrl} alt="" width={32} height={32} unoptimized /> : initials(member.name)}</div><div><strong>{member.name}{member.isCurrentUser && <span className="current-label">You</span>}</strong><span>{member.email ?? "Email not available"}</span></div></div></TableCell>
                  <TableCell>{canManage ? <SelectPicker value={member.role} options={rolePickerOptions} disabled={busyId === member.id} aria-label={`Role for ${member.name}`} onChange={(role) => void updateMember(member.id, role)} /> : <Badge variant="outline">{member.role}</Badge>}</TableCell>
                  <TableCell><span className="member-profile-detail">{member.title ?? member.bio ?? "No profile details"}</span></TableCell>
                  <TableCell>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(member.created_at))}</TableCell>
                  <TableCell className="actions-cell">{canManage ? <Button variant="outline" className="icon-button" disabled={busyId === member.id} onClick={() => void removeMember(member.id)} aria-label={`Remove ${member.name}`}><Trash2 size={15} /></Button> : <span className="muted-action"><Check size={15} /> Active</span>}</TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </section>
      )}

      {state.kind === "ready" && state.canManageAccess && <section className="team-requests"><div className="section-heading"><div><span className="eyebrow">Access review</span><h2>Pending requests</h2></div><UserRoundPlus size={18} /></div><div className="request-table-list">{requests.length === 0 ? <p className="table-empty">No pending access requests.</p> : requests.map((request) => <div className="request-table-row" key={request.id}><div><strong>{request.display_name || "Unnamed applicant"}</strong><span>{request.email}</span></div><Badge variant="outline">{request.requested_role}</Badge><div className="button-row"><Button className="primary-button" disabled={busyId === request.id} onClick={async () => { setBusyId(request.id); setError(""); try { await approveWorkspaceAccessRequest(request.id, request.requested_role); await load(activeOrganizationId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve the access request."); } finally { setBusyId(null); } }}>{busyId === request.id ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Approve</Button><Button variant="outline" disabled={busyId === request.id} onClick={async () => { setBusyId(request.id); setError(""); try { await rejectWorkspaceAccessRequest(request.id, "Rejected from team review"); await load(activeOrganizationId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reject the access request."); } finally { setBusyId(null); } }}>Reject</Button></div></div>)}</div></section>}
    </main>
  );
}
