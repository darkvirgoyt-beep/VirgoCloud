"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Box, LoaderCircle } from "lucide-react";
import { api, authStore, type User } from "@/lib/api";

type AuthResponse = { token: string; user: User };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api<AuthResponse>(`/v1/auth/${mode === "login" ? "login" : "signup"}`, { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password"), ...(mode === "signup" ? { name: form.get("name") } : {}) }) });
      authStore.set(payload.token); window.localStorage.setItem("vc_user", JSON.stringify(payload.user)); router.push("/control");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sign in."); } finally { setBusy(false); }
  }
  return <main className="grain gridline grid min-h-screen place-items-center px-5 py-10"><div className="glass w-full max-w-md rounded-3xl p-6 sm:p-8"><Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16}/> Back to home</Link><div className="mb-8 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-nebula"><Box size={21}/></span><div><p className="font-bold">VirgoCloud</p><p className="text-xs text-slate-400">Secure server control plane</p></div></div><h1 className="text-3xl font-black tracking-tight">{mode === "login" ? "Welcome back." : "Build your node fleet."}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{mode === "login" ? "Sign in to manage your Minecraft infrastructure." : "Create a protected account for your server operations."}</p><form className="mt-7 space-y-4" onSubmit={submit}>{mode === "signup" && <label className="block text-sm font-semibold">Name<input required name="name" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none ring-nebula focus:ring-2" placeholder="Alex Builder"/></label>}<label className="block text-sm font-semibold">Email<input required name="email" type="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none ring-nebula focus:ring-2" placeholder="you@example.com"/></label><label className="block text-sm font-semibold">Password<input required name="password" minLength={12} type="password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none ring-nebula focus:ring-2" placeholder="At least 12 characters"/></label>{message && <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">{message}</p>}<button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-nebula px-4 py-3 font-bold disabled:opacity-60">{busy && <LoaderCircle className="animate-spin" size={17}/>} {mode === "login" ? "Sign in" : "Create account"}</button></form><button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="mt-6 text-sm text-mint hover:underline">{mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}</button><p className="mt-5 text-xs leading-5 text-slate-500">Google sign-in is supported by the API when you add your verified Google OAuth client ID; this standalone UI intentionally keeps provider keys out of the browser bundle.</p></div></main>;
}
