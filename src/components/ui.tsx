import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { DateField, fieldBase, Select, Textarea } from "./fields";

export { DateField, Select, Textarea };

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-grad text-accent-ink font-semibold shadow-[0_8px_30px_-10px_var(--accent)] hover:shadow-[0_10px_36px_-8px_var(--accent)] hover:brightness-110",
        secondary: "glass text-fg hover:border-line-strong",
        ghost: "text-muted hover:text-fg hover:bg-panel-2",
        danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
        outline: "border border-line-strong text-fg hover:bg-panel-2",
      },
      size: {
        sm: "h-8 px-3.5 text-xs",
        md: "h-10 px-4.5",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-3xl shadow-panel", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-none tracking-wide", {
  variants: {
    tone: {
      neutral: "bg-panel-2 text-muted",
      accent: "bg-accent-soft text-accent",
      ok: "bg-ok/12 text-ok",
      warn: "bg-warn/12 text-warn",
      danger: "bg-danger/12 text-danger",
      sensitive: "bg-sensitive/12 text-sensitive",
      info: "bg-info/12 text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Text-ish inputs. type="date" renders the custom calendar picker (same value/onChange contract). */
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === "date") {
    return (
      <DateField
        value={(props.value as string) ?? ""}
        onChange={props.onChange as never}
        className={className}
        name={props.name}
        disabled={props.disabled}
        required={props.required}
        aria-label={props["aria-label"]}
        placeholder={props.placeholder}
        min={props.min as string | undefined}
        max={props.max as string | undefined}
      />
    );
  }
  return <input className={cn(fieldBase, "h-10 px-3.5", props.type === "number" && "tabular-nums", className)} {...props} />;
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between animate-rise">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-3 font-mono text-[11.5px] text-faint">{`// ${eyebrow}`}</p>}
        <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-fg md:text-[3.4rem]">{title}</h1>
        {children && <div className="mt-4 text-[15px] leading-relaxed text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-6">{icon}</div>}
      <p className="font-display text-lg font-semibold text-fg">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("glass rounded-3xl p-5", className)}>
      <p className="font-mono text-[11px] text-faint">{`// ${label}`}</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** The hand-drawn underline from the sidebar. Put inside a `relative` element. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg className={cn("squiggle pointer-events-none absolute -bottom-[7px] left-0 h-[7px] w-full overflow-visible", className)} viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden>
      <path d="M1 4.5 C 9 0.5, 15 7, 24 3.5 S 40 1, 49 4 S 66 6.5, 75 3 S 91 1.5, 99 4" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Sidebar-style tab: plain text + icon, active gets the squiggle. */
export function SquiggleTab({ active, icon: Icon, children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: React.ElementType }) {
  return (
    <button
      type="button"
      className={cn("group inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-1 py-1.5 text-[13.5px] transition-colors", active ? "font-semibold text-fg" : "text-muted hover:text-fg", className)}
      {...props}
    >
      {Icon && <Icon strokeWidth={active ? 2.25 : 1.75} className={cn("size-4 shrink-0 transition-transform group-hover:-rotate-6", active ? "text-accent" : "text-faint group-hover:text-muted")} />}
      <span className="relative">
        {children}
        {active && <Squiggle />}
      </span>
    </button>
  );
}

/** Solid popover / dropdown panel. Position it yourself (absolute right-0 top-11 …). */
export function MenuSheet({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sheet z-40 p-2 animate-pop", className)} {...props} />;
}

export function MenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-3 pb-1.5 pt-2 font-mono text-[10.5px] text-faint", className)}>{`// ${children}`}</p>;
}

export function MenuDivider() {
  return <div className="dashed-top mx-3 my-1.5" />;
}

export function MenuItem({ icon: Icon, children, danger, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ElementType; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition disabled:pointer-events-none disabled:opacity-40",
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-panel-2 hover:text-fg",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={cn("size-4 shrink-0 transition-transform group-hover:-rotate-6", danger ? "" : "text-faint group-hover:text-accent")} />}
      <span className="flex-1">{children}</span>
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}

export function Orb({ className, thinking }: { className?: string; thinking?: boolean }) {
  return <span className={cn("orb inline-block size-8 shrink-0", thinking && "thinking", className)} aria-hidden />;
}
