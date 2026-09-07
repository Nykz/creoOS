"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, LoaderCircle, Shield, Sparkles, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  createWorkspace,
  requestCompanyAccess,
  setStoredOrganizationId,
  useWorkspaceAccess,
  WorkspaceAccessProvider,
  type WorkspaceUser,
} from "@/features/workspace/workspace-access";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const onboardingSignInHref = "/sign-in?next=%2Fonboarding";

export function OnboardingClient({ initialUser }: { initialUser?: WorkspaceUser | null }) {
  return (
    <WorkspaceAccessProvider initialUser={initialUser}>
      <OnboardingContent />
    </WorkspaceAccessProvider>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const { state, loading, refresh } = useWorkspaceAccess();
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (state.kind === "ready" && state.organizations.length > 0) {
      router.replace("/");
    }
  }, [router, state]);

  const activeCopy = useMemo(() => {
    if (loading) return "Loading your workspace access";
    if (state.kind === "pending") return `${state.activeOrganization.name} is waiting for admin approval`;
    if (state.kind === "ready" && state.organizations.length > 0) return `You already have access to ${state.activeOrganization.name}`;
    return "Choose how you want to enter CreoOS";
  }, [loading, state]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");

    try {
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name") || "").trim();
      const companySlug = String(form.get("slug") || slugify(name)).trim();
      const createdOrgId = await createWorkspace({ name, slug: companySlug, seed: form.get("seed") === "on" });
      if (createdOrgId) {
        setStoredOrganizationId(createdOrgId);
      }
      setNotice(`Workspace ${name} is ready.`);
      await refresh({ force: true });
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the workspace.");
    } finally {
      setBusy(null);
    }
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("join");
    setError("");
    setNotice("");

    try {
      const form = new FormData(event.currentTarget);
      const companyCode = String(form.get("company_code") || "").trim();
      await requestCompanyAccess({
        slug: companyCode,
        requestedRole: String(form.get("role") || "viewer"),
        user: state.user,
      });
      setNotice("Your access request is pending admin approval.");
      await refresh({ force: true });
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request access.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && state.kind === "loading") {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <LoaderCircle className="spin" size={20} />
          <p>Loading your workspace access</p>
        </section>
      </main>
    );
  }

  if (state.kind === "signed_out") {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <span className="eyebrow">CreoOS</span>
          <h1>Sign in first</h1>
          <p>We need an authenticated account before we can create or request a company workspace.</p>
          <Button asChild className="primary-button">
            <Link href={onboardingSignInHref}>Go to sign in</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page onboarding-page">
      <section className="onboarding-shell">
        <aside className="onboarding-rail" aria-label="CreoOS workspace setup">
          <div className="brand-row">
            <div className="brand-mark">
              <span />
              <span />
              <span />
              <span />
            </div>
            <strong>CreoOS</strong>
          </div>

          <div className="onboarding-rail-copy">
            <span className="eyebrow">Company-first SaaS workspace</span>
            <h1>Set up the right company before work begins.</h1>
            <p>CreoOS keeps dashboards, approvals, content, and revenue tied to a verified workspace.</p>
          </div>

          <div className="onboarding-steps">
            <div>
              <Building2 size={17} />
              <span>Create a company or request access</span>
            </div>
            <div>
              <Shield size={17} />
              <span>Owner and admin approval protects company data</span>
            </div>
            <div>
              <UsersRound size={17} />
              <span>Teams can switch workspaces after verification</span>
            </div>
          </div>

          <div className="onboarding-status-card">
            <Clock3 size={17} />
            <div>
              <strong>Access status</strong>
              <span>{activeCopy}</span>
            </div>
          </div>
        </aside>

        <section className="auth-panel onboarding-panel">
          <span className="eyebrow">Workspace entry</span>
          <h2>Choose your company path</h2>
          <p>{activeCopy}</p>

          {state.kind === "pending" && (
            <section className="pending-summary">
              <Badge variant="outline">Pending approval</Badge>
              <h3>{state.activeOrganization.name}</h3>
              <p>
                Your request is queued under {state.activeOrganization.slug}. If you picked the wrong company, submit the other code before
                an admin approves it.
              </p>
              <div className="button-row">
                <Button className="primary-button" onClick={() => router.replace("/")}>
                  Open waiting room
                </Button>
                <Button variant="outline" onClick={() => void refresh({ force: true })}>
                  Refresh status
                </Button>
              </div>
            </section>
          )}

          {state.kind === "ready" && state.organizations.length > 0 && (
            <section className="pending-summary">
              <Badge variant="outline">Verified company access</Badge>
              <h3>{state.activeOrganization.name}</h3>
              <p>
                You can enter the dashboard for any approved company, and switch active company from the sidebar whenever you need to work in
                another workspace.
              </p>
              <div className="button-row">
                <Button className="primary-button" onClick={() => router.replace("/")}>
                  Go to dashboard
                </Button>
                <Button variant="outline" onClick={() => void refresh({ force: true })}>
                  Refresh status
                </Button>
              </div>
            </section>
          )}

          {notice && (
            <p className="auth-success">
              <CheckCircle2 size={16} /> {notice}
            </p>
          )}
          {error && <p className="auth-error">{error}</p>}

          <Tabs defaultValue="create" className="workspace-tabs">
            <TabsList className="workspace-tabs-list">
              <TabsTrigger value="create">Create company</TabsTrigger>
              <TabsTrigger value="join">Join company</TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <form onSubmit={submitCreate} className="workspace-form">
                <label>
                  Company name
                  <Input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={companyName}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setCompanyName(nextName);
                      if (!slug) setSlug(slugify(nextName));
                    }}
                    placeholder="Arjun Creator Studio"
                  />
                </label>
                <label>
                  Company code
                  <Input
                    name="slug"
                    required
                    minLength={2}
                    maxLength={120}
                    value={slug}
                    onChange={(event) => setSlug(slugify(event.target.value))}
                    placeholder="arjun-creator-studio"
                  />
                </label>
                <label className="check-row">
                  <input type="checkbox" name="seed" />
                  Add a guided sample workspace
                </label>
                <p className="small-copy">The company owner becomes the first verified admin. Team members can join after review.</p>
                <Button className="primary-button auth-submit" disabled={busy !== null}>
                  {busy === "create" && <LoaderCircle className="spin" size={16} />}
                  Create workspace
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="join">
              <form onSubmit={submitJoin} className="workspace-form">
                <label>
                  Company code
                  <Input name="company_code" required minLength={2} maxLength={120} placeholder="arjun-creator-studio" />
                </label>
                <label>
                  Requested role
                  <select name="role" defaultValue="viewer" aria-label="Requested role">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </label>
                <div className="info-surface">
                  <Shield size={16} />
                  <p>You can enter the app immediately, but company data stays locked until an admin approves your request.</p>
                </div>
                <Button className="primary-button auth-submit" disabled={busy !== null}>
                  {busy === "join" && <LoaderCircle className="spin" size={16} />}
                  Request access
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="workspace-note">
            <Sparkles size={16} />
            <p>Switching company before approval updates the same request, so verification goes to the correct workspace.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
