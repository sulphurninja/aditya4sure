import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Orb } from "@/components/ui";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session-token";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const jar = await cookies();
  if (await verifySession(jar.get(SESSION_COOKIE)?.value).catch(() => false)) redirect("/");
  return (
    <main className="relative z-10 grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm animate-rise">
        <Orb className="mb-10 size-14 animate-float" />
        <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-[-0.05em]">
          hey <span className="text-grad">Aditya.</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">your second brain missed you. unlock it.</p>
        <LoginForm />
        <p className="mt-10 text-xs leading-relaxed text-faint">Just you in here. Memories live in your MongoDB; only what you ask about goes to Claude.</p>
      </div>
    </main>
  );
}
