import { useId } from "react";
import { INSTAGRAM_PATH, WHATSAPP_PATH } from "./brand-paths";
import { cn } from "@/lib/utils";

/** The real WhatsApp / Instagram marks. Size it with className (e.g. size-5). */
export function SourceIcon({ source, className }: { source: "whatsapp" | "instagram"; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (source === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} role="img" aria-label="WhatsApp">
        <path d={WHATSAPP_PATH} fill="#25D366" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} role="img" aria-label="Instagram">
      <defs>
        <radialGradient id={`ig-${id}`} cx="0.3" cy="1.07" r="1.2">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </radialGradient>
      </defs>
      <path d={INSTAGRAM_PATH} fill={`url(#ig-${id})`} />
    </svg>
  );
}
