"use client";

import { Command } from "cmdk";
import { FileText, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { NAV } from "./nav";
import { Kbd, Orb } from "./ui";
import { cn } from "@/lib/utils";

type SearchHit = {
  entities: { id: string; name: string; kind: string; slug: string }[];
  memories: { _id: string; statement: string; section: string }[];
};

const NO_HITS: SearchHit = { entities: [], memories: [] };
const GROUP_CLS =
  "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[10.5px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.14em] **:[[cmdk-group-heading]]:text-faint";
const LOOK_EVENT = "aditya-look-change";

const ACCENTS = [
  { id: "ember", a: "#ff7a45", b: "#ff3d81" },
  { id: "lavender", a: "#a78bfa", b: "#f0abfc" },
  { id: "sakura", a: "#fb7185", b: "#f9a8d4" },
  { id: "ocean", a: "#38bdf8", b: "#818cf8" },
  { id: "lime", a: "#c6f432", b: "#34d399" },
] as const;

function subscribeLook(cb: () => void) {
  window.addEventListener(LOOK_EVENT, cb);
  return () => window.removeEventListener(LOOK_EVENT, cb);
}
const readTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const readAccent = () => document.documentElement.dataset.accent ?? "ember";

function setLook(key: "theme" | "accent", value: string) {
  document.documentElement.dataset[key] = value;
  try {
    localStorage.setItem(`aditya-${key}`, value);
  } catch {}
  window.dispatchEvent(new Event(LOOK_EVENT));
}

function entityHref(kind: string, slug: string) {
  return kind === "project" || kind === "organization" ? `/projects/${slug}` : `/people/${slug}`;
}

export function Shell({ children, pendingReview, ownerName }: { children: React.ReactNode; pendingReview: number; ownerName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const theme = useSyncExternalStore(subscribeLook, readTheme, () => "dark");
  const accent = useSyncExternalStore(subscribeLook, readAccent, () => "ember");
  const [q, setQ] = useState("");
  const [rawHits, setHits] = useState<SearchHit>(NO_HITS);
  const hits = q.trim().length < 2 ? NO_HITS : rawHits;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : NO_HITS))
        .then(setHits)
        .catch(() => {});
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const toggleTheme = useCallback(() => setLook("theme", theme === "dark" ? "light" : "dark"), [theme]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto pb-4">
      {(["core", "life", "system"] as const).map((group) => (
        <div key={group}>
          {group !== "core" && <p className="mb-1.5 px-6 font-mono text-[10.5px] text-faint">{group === "life" ? "// life" : "// brain"}</p>}
          <ul>
            {NAV.filter((n) => n.group === group).map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              const Icon = n.icon;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={() => setMobile(false)}
                    className={cn("group flex items-center gap-3 px-6 py-[7px] text-[14px] transition-colors", active ? "font-semibold text-fg" : "text-muted hover:text-fg")}
                  >
                    <Icon strokeWidth={active ? 2.25 : 1.75} className={cn("size-[17px] shrink-0 transition-transform group-hover:-rotate-6", active ? "text-accent" : "text-faint group-hover:text-muted")} />
                    <span className="relative">
                      {n.label}
                      {active && (
                        <svg key={pathname} className="squiggle absolute -bottom-[7px] left-0 h-[7px] w-full overflow-visible" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden>
                          <path d="M1 4.5 C 9 0.5, 15 7, 24 3.5 S 40 1, 49 4 S 66 6.5, 75 3 S 91 1.5, 99 4" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        </svg>
                      )}
                    </span>
                    {n.href === "/review" && pendingReview > 0 && <span className="ml-auto font-mono text-[11px] font-semibold text-accent">{pendingReview}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link href="/" className="group block px-6 pb-7 pt-7">
      <span className="flex items-center gap-2">
        <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.065em]">aditya</span>
        <Orb className="size-2.5 translate-y-1 transition-transform group-hover:scale-150" />
      </span>
      <span className="mt-1.5 block font-mono text-[10.5px] text-faint">second brain · v1</span>
    </Link>
  );

  const footer = (
    <div className="space-y-4 border-t border-dashed border-line-strong px-6 py-5">
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 text-left text-[13px] text-faint transition hover:text-fg">
        <Search className="size-4" />
        <span className="flex-1">search anything</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="flex items-center gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setLook("accent", a.id)}
            title={a.id}
            aria-label={`${a.id} theme`}
            className={cn("size-4 rounded-[5px] transition hover:-rotate-12 hover:scale-110", accent === a.id ? "rotate-45 scale-110 shadow-[0_0_14px_-2px_var(--accent)]" : "opacity-70")}
            style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
          />
        ))}
        <span className="flex-1" />
        <button onClick={toggleTheme} className="text-faint transition hover:text-fg" aria-label="Toggle light/dark">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button onClick={logout} className="text-faint transition hover:text-fg" aria-label="Sign out" title={`sign out, ${ownerName.split(" ")[0]}`}>
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative z-10 flex min-h-dvh">
      <aside className="rail fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      <div className="rail fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line px-2 lg:hidden">
        <button onClick={() => setMobile(true)} className="rounded-full p-2 text-muted" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-xl font-extrabold tracking-[-0.06em]">aditya</span>
          <Orb className="size-2 translate-y-0.5" />
        </Link>
        <button onClick={() => setOpen(true)} className="rounded-full p-2 text-muted" aria-label="Search">
          <Search className="size-5" />
        </button>
      </div>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-panel-solid animate-rise">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setMobile(false)} className="p-2 text-muted" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main className="relative min-w-0 flex-1 lg:pl-64">{children}</main>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search your brain"
        shouldFilter={false}
        className="sheet fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 animate-pop"
        overlayClassName="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search className="size-4 text-accent" />
          <Command.Input value={q} onValueChange={setQ} placeholder="search people, projects, memories, or just ask…" className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint" />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-faint">Nothing found.</Command.Empty>
          {q.trim().length > 1 && (
            <Command.Item value={`ask ${q}`} onSelect={() => go(`/?q=${encodeURIComponent(q)}`)} className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-fg data-[selected=true]:bg-panel-2">
              <Orb className="size-5" /> Ask: <span className="truncate text-muted">{q}</span>
            </Command.Item>
          )}
          {hits.entities.length > 0 && (
            <Command.Group heading="People & projects" className={GROUP_CLS}>
              {hits.entities.map((e) => (
                <Command.Item key={e.id} value={e.id} onSelect={() => go(entityHref(e.kind, e.slug))} className="flex cursor-pointer items-center justify-between rounded-2xl px-3 py-2 text-sm data-[selected=true]:bg-panel-2">
                  <span>{e.name}</span>
                  <span className="text-[10.5px] uppercase text-faint">{e.kind}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {hits.memories.length > 0 && (
            <Command.Group heading="Memories" className={GROUP_CLS}>
              {hits.memories.map((m) => (
                <Command.Item key={m._id} value={m._id} onSelect={() => go(`/vault/${encodeURIComponent(m._id)}`)} className="flex cursor-pointer items-start gap-2 rounded-2xl px-3 py-2 text-sm data-[selected=true]:bg-panel-2">
                  <FileText className="mt-0.5 size-3.5 shrink-0 text-faint" />
                  <span className="line-clamp-2 text-muted">{m.statement}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Go to" className={GROUP_CLS}>
            {NAV.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())).map((n) => {
              const Icon = n.icon;
              return (
                <Command.Item key={n.href} value={n.href} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-muted data-[selected=true]:bg-panel-2 data-[selected=true]:text-fg">
                  <Icon className="size-4 text-faint" /> {n.label}
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
