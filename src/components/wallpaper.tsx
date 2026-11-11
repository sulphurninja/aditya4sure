"use client";

import { Check, ImagePlus, Loader2, Palette, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WALLPAPER_PRESETS, type Wallpaper, type WallpaperPreset } from "@/lib/domain";
import { cn } from "@/lib/utils";

const PRESET_LABEL: Record<WallpaperPreset, string> = {
  aurora: "Aurora",
  midnight: "Midnight",
  sunset: "Sunset",
  lavender: "Lavender haze",
  hearts: "Hearts",
  dots: "Dots",
  grid: "Grid",
  ocean: "Ocean",
};

/** Full-bleed background for a chat. Sits behind messages. */
export function WallpaperLayer({ wp, className }: { wp?: Wallpaper | null; className?: string }) {
  if (!wp || wp.kind === "none") return null;
  if (wp.kind === "preset") return <div className={cn("pointer-events-none absolute inset-0", `wp-${wp.id}`, className)} aria-hidden />;
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated image, not optimizable */}
      <img src={`/api/wallpapers/${wp.id}`} alt="" className="size-full scale-105 object-cover" style={{ filter: wp.blur ? `blur(${wp.blur}px)` : undefined }} />
      <div className="absolute inset-0" style={{ background: `rgb(5 5 8 / ${wp.dim})` }} />
    </div>
  );
}

async function resizeToDataUrl(file: File, max = 1920): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

type Uploaded = { _id: string; bytes: number; createdAt: string };

export function WallpaperPicker({ value, onChange, disabled }: { value?: Wallpaper | null; onChange: (wp: Wallpaper) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [uploads, setUploads] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = value ?? { kind: "none" as const };

  useEffect(() => {
    if (!open) return;
    fetch("/api/wallpapers")
      .then((r) => (r.ok ? r.json() : { wallpapers: [] }))
      .then((d) => setUploads(d.wallpapers))
      .catch(() => {});
    const close = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("That's not an image");
    setBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      const res = await fetch("/api/wallpapers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setUploads((u) => [{ _id: data.id, bytes: 0, createdAt: new Date().toISOString() }, ...u]);
      onChange({ kind: "image", id: data.id, dim: 0.45, blur: 0 });
      toast.success("wallpaper set");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeUpload(id: string) {
    if (!confirm("Delete this photo? Chats using it go back to no wallpaper.")) return;
    await fetch(`/api/wallpapers/${id}`, { method: "DELETE" });
    setUploads((u) => u.filter((x) => x._id !== id));
    if (current.kind === "image" && current.id === id) onChange({ kind: "none" });
  }

  return (
    <div className="relative" ref={panel}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        title={disabled ? "send a message first, then pick a wallpaper" : "chat wallpaper"}
        className="group inline-flex h-9 items-center gap-1.5 px-2 text-xs text-muted transition hover:text-fg disabled:opacity-40"
      >
        <Palette className="size-[18px] transition-transform group-hover:-rotate-12" /> <span className="hidden sm:inline">wallpaper</span>
      </button>
      {open && (
        <div className="sheet absolute right-0 top-11 z-40 w-[320px] p-4 animate-pop">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[11px] text-faint">{"// chat wallpaper"}</p>
            <button onClick={() => setOpen(false)} className="text-faint hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => onChange({ kind: "none" })} className={cn("relative grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-line-strong text-[10px] text-faint", current.kind === "none" && "ring-2 ring-accent")}>
              none
            </button>
            {WALLPAPER_PRESETS.map((p) => (
              <button key={p} onClick={() => onChange({ kind: "preset", id: p })} title={PRESET_LABEL[p]} className={cn("relative aspect-[3/4] overflow-hidden rounded-lg border border-line", `wp-${p}`, current.kind === "preset" && current.id === p && "ring-2 ring-accent")}>
                {current.kind === "preset" && current.id === p && <Check className="absolute right-1 top-1 size-3.5 text-white" />}
              </button>
            ))}
          </div>
          <div className="dashed-top mt-4 pt-3"><p className="mb-2 font-mono text-[11px] text-faint">{"// your photos"}</p></div>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="grid aspect-[3/4] place-items-center rounded-lg bg-accent-soft text-accent transition hover:brightness-125">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </button>
            {uploads.map((u) => (
              <div key={u._id} className="group relative">
                <button onClick={() => onChange({ kind: "image", id: u._id, dim: current.kind === "image" ? current.dim : 0.45, blur: current.kind === "image" ? current.blur : 0 })} className={cn("block aspect-[3/4] w-full overflow-hidden rounded-lg border border-line", current.kind === "image" && current.id === u._id && "ring-2 ring-accent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/wallpapers/${u._id}`} alt="" className="size-full object-cover" />
                </button>
                <button onClick={() => removeUpload(u._id)} className="absolute -right-1 -top-1 hidden rounded-full bg-panel-solid p-1 text-faint shadow hover:text-danger group-hover:block" aria-label="Delete photo">
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {current.kind === "image" && (
            <div className="mt-4 space-y-3 text-xs text-muted">
              <label className="block">
                Dim · {Math.round(current.dim * 100)}%
                <input type="range" min={0} max={0.85} step={0.05} value={current.dim} onChange={(e) => onChange({ ...current, dim: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />
              </label>
              <label className="block">
                Blur · {current.blur}px
                <input type="range" min={0} max={20} step={1} value={current.blur} onChange={(e) => onChange({ ...current, blur: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />
              </label>
            </div>
          )}
          <p className="mt-4 text-[10.5px] leading-relaxed text-faint">Photos are resized in your browser and stored encrypted in your database. Only you can load them.</p>
        </div>
      )}
    </div>
  );
}
