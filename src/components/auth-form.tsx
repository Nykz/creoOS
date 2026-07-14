"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    __CREOOS_AUTH_FORM_READY?: boolean;
  }
}

export function AuthForm({ mode, nextPath = "/" }: { mode: "sign-in" | "sign-up"; nextPath?: string }) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "sign-up";

  useEffect(() => {
    window.__CREOOS_AUTH_FORM_READY = true;
    return () => {
      window.__CREOOS_AUTH_FORM_READY = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || ""),
      ...(signup ? { name: String(form.get("name") || "").trim() } : {}),
    };

    try {
      const response = await fetch(signup ? "/api/auth/sign-up" : "/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(typeof body.message === "string" ? body.message : "Authentication failed.");
        return;
      }

      if (signup && body.requireEmailVerification) {
        setSuccess("Account created. Check your email to verify your account before creating a workspace.");
        return;
      }

      window.location.assign(signup ? "/onboarding" : nextPath);
    } catch {
      setError("Network request failed. Please check the backend connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-row">
          <div className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </div>
          <strong>CreoOS</strong>
        </div>
        <span className="eyebrow">Creator business operating system</span>
        <h1>{signup ? "Build your company workspace" : "Welcome back"}</h1>
        <p>{signup ? "Start with your company, then invite your team with the roles they need." : "Sign in to your company workspace."}</p>
        <form method="post" action={signup ? "/api/auth/sign-up" : "/api/auth/sign-in"} onSubmit={submit}>
          {signup && (
            <label>
              Name
              <Input name="name" required maxLength={100} />
            </label>
          )}
          <label>
            Email
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <Input name="password" type="password" required minLength={10} autoComplete={signup ? "new-password" : "current-password"} />
          </label>
          {success && <p className="auth-success">{success}</p>}
          {error && <p className="auth-error">{error}</p>}
          <Button type="submit" className="primary-button auth-submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}
            {signup ? "Create company account" : "Sign in"}
          </Button>
        </form>
        <p className="auth-switch">
          {signup ? "Already have a workspace?" : "New to CreoOS?"}{" "}
          <Link href={signup ? "/sign-in" : "/sign-up"}>{signup ? "Sign in" : "Create an account"}</Link>
        </p>
      </section>
    </main>
  );
}
