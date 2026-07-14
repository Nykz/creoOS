"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message); setNotice("Password updated. You can sign in with your new password."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update password."); } finally { setSaving(false); }
  }
  return <main className="auth-page"><section className="auth-card"><div className="brand-row"><div className="brand-mark"><span /><span /><span /><span /></div><strong>CreoOS</strong></div><LockKeyhole size={22} /><h1>Set a new password</h1>{notice ? <><p>{notice}</p><Button asChild className="primary-button"><Link href="/sign-in">Go to sign in</Link></Button></> : !token ? <p>This reset link is missing or expired. Request a new one from Settings.</p> : <form className="auth-form" onSubmit={submit}><label>New password<Input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<Button className="primary-button" disabled={saving}>{saving ? "Updating password" : "Update password"}</Button></form>}</section></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><section className="auth-card">Loading password reset</section></main>}><ResetPasswordForm /></Suspense>;
}
