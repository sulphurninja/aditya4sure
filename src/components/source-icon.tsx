import { useId } from "react";
import { INSTAGRAM_PATH, WHATSAPP_PATH } from "./brand-paths";
import { cn } from "@/lib/utils";

/** The real WhatsApp / Instagram marks. Size it with className (e.g. size-5). */
export function SourceIcon({ source, className }: { source: "whatsapp" | "instagram" | "chatgpt"; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (source === "chatgpt") {
    // Simple neutral knot mark (not OpenAI's logo): a chat bubble with a spark.
    return (
      <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} role="img" aria-label="ChatGPT">
        <rect x="2" y="3" width="20" height="15" rx="5" fill="#10a37f" />
        <path d="M7 18l-2 4 5-4" fill="#10a37f" />
        <path d="M12 6.5l1.2 2.8 2.8 1.2-2.8 1.2L12 14.5l-1.2-2.8L8 10.5l2.8-1.2z" fill="#fff" />
      </svg>
    );
  }
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
