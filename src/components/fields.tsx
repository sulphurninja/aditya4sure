"use client";

import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover, Select as RSelect } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Custom fields that replace the browser's native dropdowns, date pickers and textareas.
 * They keep the native-style API (value + onChange(e) + <option> children) so every
 * existing form upgrades without touching call sites.
 */

export const fieldBase =
  "w-full rounded-2xl border border-line-strong bg-panel text-sm text-fg placeholder:text-faint outline-none transition hover:border-faint/60 focus:border-accent-line focus:ring-[3px] focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50";

/** Radix can't use "" as an item value, so empty options ride on a sentinel. */
const EMPTY = "__empty__";

type ChangeShim = React.ChangeEvent<HTMLSelectElement & HTMLInputElement & HTMLTextAreaElement>;
const shim = (value: string, name?: string) => ({ target: { value, name }, currentTarget: { value, name } }) as unknown as ChangeShim;

type OptionEl = React.ReactElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>;

/* ---------------- Select ---------------- */

export function Select({
  value,
  defaultValue,
  onChange,
  children,
  className,
  disabled,
  name,
  required,
  "aria-label": ariaLabel,
  placeholder,
}: {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: ChangeShim) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
  placeholder?: string;
}) {
  const options = React.Children.toArray(children)
    .filter((c): c is OptionEl => React.isValidElement(c) && c.type === "option")
    .map((o) => ({ value: String(o.props.value ?? ""), label: o.props.children, disabled: o.props.disabled }));
  const enc = (v: string | number | undefined) => (v === undefined ? undefined : String(v) === "" ? EMPTY : String(v));
  const compact = /\bh-(8|9)\b/.test(className ?? "");
  return (
    <RSelect.Root
      value={enc(value)}
      defaultValue={enc(defaultValue)}
      onValueChange={(v) => onChange?.(shim(v === EMPTY ? "" : v, name))}
      disabled={disabled}
      name={name}
      required={required}
    >
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          fieldBase,
          "group inline-flex h-10 w-auto cursor-pointer items-center justify-between gap-2 px-3.5 text-left data-[placeholder]:text-faint data-[state=open]:border-accent-line data-[state=open]:ring-[3px] data-[state=open]:ring-accent-soft",
          compact && "rounded-xl px-3",
          className,
        )}
      >
        <span className="truncate">
          <RSelect.Value placeholder={placeholder ?? "pick one"} />
        </span>
        <RSelect.Icon>
          <ChevronDown className="size-3.5 shrink-0 text-faint transition-transform group-data-[state=open]:rotate-180" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={6} className="sheet relative z-[80] max-h-[min(var(--radix-select-content-available-height),340px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1.5 animate-pop">
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value || EMPTY}
                value={o.value === "" ? EMPTY : o.value}
                disabled={o.disabled}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-xl py-2 pl-3 pr-8 text-[13.5px] text-muted outline-none transition data-[disabled]:pointer-events-none data-[highlighted]:bg-panel-2 data-[state=checked]:font-medium data-[highlighted]:text-fg data-[state=checked]:text-fg data-[disabled]:opacity-40"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute right-2.5">
                  <Check className="size-3.5 text-accent" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/* ---------------- Date ---------------- */

const WEEK = ["mo", "tu", "we", "th", "fr", "sa", "su"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(v: string | undefined | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function todayLocal() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function label(v: string) {
  const d = parse(v);
  if (!d) return "";
  const t = todayLocal();
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric", weekday: Math.abs(diff) < 7 ? "short" : undefined }).toLowerCase();
}

export function DateField({
  value,
  onChange,
  className,
  placeholder = "pick a date",
  name,
  disabled,
  required,
  "aria-label": ariaLabel,
  min,
  max,
}: {
  value?: string;
  onChange?: (e: ChangeShim) => void;
  className?: string;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  min?: string;
  max?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parse(value);
  const [view, setView] = React.useState(() => {
    const base = selected ?? todayLocal();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const set = (v: string) => {
    onChange?.(shim(v, name));
    setOpen(false);
  };
  const t = todayLocal();
  const first = (view.getDay() + 6) % 7;
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  const compact = /\bh-(8|9)\b/.test(className ?? "");
  const outOfRange = (d: Date) => Boolean((min && ymd(d) < min) || (max && ymd(d) > max));
  const nextSunday = addDays(t, ((7 - t.getDay()) % 7) || 7);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          const base = selected ?? t;
          setView(new Date(base.getFullYear(), base.getMonth(), 1));
        }
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel ?? placeholder}
          className={cn(fieldBase, "group inline-flex h-10 w-auto cursor-pointer items-center gap-2 px-3.5 text-left data-[state=open]:border-accent-line data-[state=open]:ring-[3px] data-[state=open]:ring-accent-soft", compact && "rounded-xl px-3", className)}
        >
          <CalendarDays className="size-3.5 shrink-0 text-faint transition group-hover:text-accent" />
          <span className={cn("truncate", !value && "text-faint")}>{value ? label(value) : placeholder}</span>
          {required && <input tabIndex={-1} aria-hidden className="sr-only" value={value ?? ""} required onChange={() => {}} />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className="sheet relative z-[80] w-[272px] p-3 animate-pop">
          <div className="mb-2 flex items-center">
            <button type="button" aria-label="previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="grid size-7 place-items-center rounded-full text-faint hover:bg-panel-2 hover:text-fg">
              <ChevronLeft className="size-4" />
            </button>
            <p className="flex-1 text-center text-[13px] font-semibold text-fg">{view.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toLowerCase()}</p>
            <button type="button" aria-label="next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="grid size-7 place-items-center rounded-full text-faint hover:bg-panel-2 hover:text-fg">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEK.map((w) => (
              <span key={w} className="pb-1 font-mono text-[10px] text-faint">
                {w}
              </span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  disabled={outOfRange(d)}
                  onClick={() => set(ymd(d))}
                  className={cn(
                    "grid aspect-square place-items-center rounded-xl text-[12.5px] tabular-nums transition disabled:pointer-events-none disabled:opacity-25",
                    value && ymd(d) === value.slice(0, 10) ? "bg-grad font-semibold text-accent-ink" : ymd(d) === ymd(t) ? "text-accent ring-1 ring-accent-line" : "text-muted hover:bg-panel-2 hover:text-fg",
                  )}
                >
                  {d.getDate()}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
          <div className="dashed-top mt-3 flex flex-wrap gap-1.5 pt-3">
            {[
              ["today", t],
              ["tomorrow", addDays(t, 1)],
              ["sunday", nextSunday],
              ["+1 week", addDays(t, 7)],
            ].map(([l, d]) => (
              <button key={l as string} type="button" onClick={() => set(ymd(d as Date))} className="rounded-full bg-panel-2 px-2.5 py-1 text-[11.5px] text-muted transition hover:bg-accent-soft hover:text-accent">
                {l as string}
              </button>
            ))}
            {value && !required && (
              <button type="button" onClick={() => set("")} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-faint hover:text-danger">
                <X className="size-3" /> clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ---------------- Textarea (auto-grows, no drag handle) ---------------- */

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }>(function Textarea({ className, maxRows = 12, onInput, rows = 2, ...props }, outer) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  const fit = React.useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const cap = line * maxRows + 24;
    el.style.height = `${Math.min(el.scrollHeight + 2, cap)}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  }, [maxRows]);
  React.useLayoutEffect(fit, [fit, props.value]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof outer === "function") outer(el);
        else if (outer) outer.current = el;
      }}
      rows={rows}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      className={cn(fieldBase, "resize-none px-3.5 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
});
