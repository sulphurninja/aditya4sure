"use client";

import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { passphrase: pass } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-3">
      <label className="block">
        <span className="mb-2 flex items-center gap-1.5 text-xs text-muted">
          <LockKeyhole className="size-3.5" /> Passphrase
        </span>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="h-11 text-[15px]"
          placeholder="••••••••••••••••"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !pass}>
        {busy ? <Loader2 className="animate-spin" /> : <>Enter <ArrowRight /></>}
      </Button>
    </form>
  );
}
