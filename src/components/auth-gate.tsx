"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceAccess } from "@/features/workspace/workspace-access";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, loading, refresh } = useWorkspaceAccess();
  const [slowRestore, setSlowRestore] = useState(false);
  const showRecovery = loading && slowRestore;
  const sessionNeedsSignIn = state.kind === "error" && /no refresh token/i.test(state.error);

  async function recoverSession() {
    if (!sessionNeedsSignIn) {
      await refresh();
      return;
    }
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }

  useEffect(() => {
    if (state.kind === "signed_out") {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router, state.kind]);

  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => setSlowRestore(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  if (loading || state.kind === "signed_out") {
    return (
      <main className="auth-loading">
        <section className="restore-card" aria-live="polite">
          <div className="restore-mark">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="restore-loader">
            <LoaderCircle className="spin" size={24} />
          </div>
          <strong>{showRecovery ? "Still checking your workspace" : "Opening workspace"}</strong>
          <p>
            {showRecovery
              ? "The session check is taking longer than expected. You can retry without reloading the page."
              : "Syncing your session, company access, and live workspace."}
          </p>
          {showRecovery && (
            <Button className="primary-button" onClick={() => void refresh()}>
              <RefreshCw size={16} /> Retry workspace check
            </Button>
          )}
        </section>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <CircleAlert size={22} />
          <span className="eyebrow">Workspace check failed</span>
          <h1>Could not load your workspace</h1>
          <p>{state.error}</p>
          <Button className="primary-button" onClick={() => void recoverSession()}>
            <RefreshCw size={16} /> {sessionNeedsSignIn ? "Sign in again" : "Try again"}
          </Button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
