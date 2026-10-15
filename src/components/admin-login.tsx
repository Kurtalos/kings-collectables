"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole, ArrowRight, LoaderCircle, ArrowLeft } from "lucide-react";
import { Brand, requestJSON } from "./ui";
export function AdminLogin() {
  const router = useRouter(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function signIn(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const fields = new FormData(event.currentTarget); try { await requestJSON("/api/owner", { method: "POST", body: JSON.stringify({ password: fields.get("password") }) }); router.refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign in."); } finally { setBusy(false); } }
  return <main className="owner-login"><div className="owner-login-card"><Brand/><span className="owner-lock"><LockKeyhole size={25}/></span><span className="eyebrow">YOUR STORE. YOUR RULES.</span><h1>Welcome back<br/>to the shop.</h1><p>Sign in to your independent store workspace.</p><form onSubmit={signIn} className="stack-form"><label>Owner password<input name="password" type="password" autoComplete="current-password" required placeholder="Your owner password"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <LockKeyhole size={16}/>} {busy ? "Signing in…" : "Open workspace"}<ArrowRight size={15}/></button></form><Link href="/" className="back-link"><ArrowLeft size={13}/> Back to storefront</Link></div></main>;
}
