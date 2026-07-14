"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, LockKeyhole, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signOutWorkspace, useWorkspaceAccess } from "@/features/workspace/workspace-access";

export default function SettingsPage() {
  const router = useRouter();
  const { state, loading, setActiveOrganizationId, refresh } = useWorkspaceAccess();
  const activeOrganizationId = state.kind === "ready" ? state.activeOrganization.id : "";
  const activeOrganization = state.kind === "ready" && state.activeOrganization.id ? state.activeOrganization : null;
  const [name, setName] = useState(state.user?.name ?? "");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  if (loading) return <main className="module-page"><header className="module-header"><div><span className="eyebrow">CreoOS workspace</span><h1>Settings</h1><p>Manage your account and workspace preferences.</p></div></header><section className="loading-surface">Loading settings</section></main>;
  if (!activeOrganizationId) return <main className="module-page"><header className="module-header"><div><span className="eyebrow">CreoOS workspace</span><h1>Settings</h1><p>Manage your account and workspace preferences.</p></div></header><section className="empty-surface"><h2>Select or create a company first</h2><p>Settings appear after a verified company workspace is active.</p></section></main>;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, title, bio }) });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Could not update profile.");
      setNotice("Profile updated."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update profile."); } finally { setSaving(false); }
  }

  async function sendReset() {
    setSendingReset(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/send-reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: state.user?.email }) });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Could not send reset instructions.");
      setNotice(body?.message || "Password reset instructions sent.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send reset instructions."); } finally { setSendingReset(false); }
  }

  return <main className="module-page">
    <header className="module-header"><div><span className="eyebrow">CreoOS workspace</span><h1>Settings</h1><p>Keep your identity current and control workspace access.</p></div><Button variant="outline" onClick={async () => { await signOutWorkspace(); router.replace("/sign-in"); }}>Sign out</Button></header>
    {(notice || error) && <section className={error ? "error-banner" : "success-banner"}><div>{error ? <><h2>Settings were not saved</h2><p>{error}</p></> : <><Check size={16} /><span>{notice}</span></>}</div></section>}
    <section className="settings-layout">
      <Card className="surface-card settings-profile-card"><div className="section-heading"><div><span className="eyebrow">Your identity</span><h2>Profile</h2></div><UserRound size={18} /></div><p className="small-copy">This information appears beside your name in Team and workspace activity.</p><form className="settings-form" onSubmit={saveProfile}><label>Name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Email<Input value={state.user?.email ?? ""} readOnly /></label><label>Role<Input value={state.kind === "ready" ? state.activeOrganization.role : "viewer"} readOnly /></label><label>Job title<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Creator, producer, strategist" /></label><label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="A short note about your role" /></label><Button className="primary-button" disabled={saving}>{saving ? "Saving profile" : <><Save size={16} /> Save profile</>}</Button></form></Card>
      <div className="settings-side-stack"><Card className="surface-card"><div className="section-heading"><div><span className="eyebrow">Security</span><h2>Password</h2></div><LockKeyhole size={18} /></div><p className="small-copy">Send a secure reset link to your account email. The link opens a dedicated password update screen.</p><Button variant="outline" onClick={() => void sendReset()} disabled={sendingReset}>{sendingReset ? "Sending instructions" : "Change password"}</Button></Card><Card className="surface-card"><div className="section-heading"><div><span className="eyebrow">Company</span><h2>{activeOrganization?.name ?? "Workspace"}</h2></div></div><p className="small-copy">{activeOrganization?.slug}</p>{state.kind === "ready" && state.organizations.length > 1 && <div className="switch-list">{state.organizations.map((organization) => <button key={organization.id} className={`nav-item switch-item ${organization.id === activeOrganizationId ? "active" : ""}`} onClick={() => { setActiveOrganizationId(organization.id); router.refresh(); }} type="button"><span>{organization.name}</span><small>{organization.slug}</small></button>)}</div>}<Button asChild variant="outline"><Link href="/team">Review team access</Link></Button></Card></div>
    </section>
  </main>;
}
