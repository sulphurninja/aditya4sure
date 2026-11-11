import Link from "next/link";
import type { Edge, Entity } from "@/lib/domain";

type Node = Entity & { x: number; y: number; r: number; n: number };

const KIND_COLOR: Record<string, string> = {
  person: "var(--accent-2)",
  project: "var(--accent)",
  pet: "var(--ok)",
  organization: "var(--info)",
  place: "var(--muted)",
};

function hrefFor(e: Entity) {
  return e.kind === "project" || e.kind === "organization" ? `/projects/${e.slug}` : `/people/${e.slug}`;
}

/** Radial map of the owner's world: self at center, people inside, projects outside. */
export function Constellation({ entities, edges, counts, height = 420 }: { entities: Entity[]; edges: Edge[]; counts: Record<string, number>; height?: number }) {
  const W = 760;
  const H = height;
  const cx = W / 2;
  const cy = H / 2;
  const self = entities.find((e) => e._id === "person:aditya");
  const people = entities.filter((e) => (e.kind === "person" || e.kind === "pet") && e._id !== "person:aditya");
  const outer = entities.filter((e) => e.kind === "project" || e.kind === "organization");
  const maxN = Math.max(1, ...Object.values(counts));
  const size = (id: string) => 5 + 11 * Math.sqrt((counts[id] ?? 0) / maxN);

  const place = (list: Entity[], rx: number, ry: number, offset: number): Node[] =>
    list.map((e, i) => {
      const a = offset + (i / Math.max(1, list.length)) * Math.PI * 2;
      return { ...e, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, r: size(e._id), n: counts[e._id] ?? 0 };
    });

  const nodes: Node[] = [
    ...(self ? [{ ...self, x: cx, y: cy, r: 20, n: counts[self._id] ?? 0 }] : []),
    ...place(people, W * 0.24, H * 0.27, -Math.PI / 2),
    ...place(outer, W * 0.43, H * 0.42, -Math.PI / 2 + 0.35),
  ];
  const byId = new Map(nodes.map((n) => [n._id, n]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of people and projects">
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={W * 0.24} ry={H * 0.27} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
      <ellipse cx={cx} cy={cy} rx={W * 0.43} ry={H * 0.42} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
      <circle cx={cx} cy={cy} r={90} fill="url(#core)" />
      {edges.map((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        return <line key={e._id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line-strong)" strokeWidth={1} />;
      })}
      {nodes.map((n) => (
        <Link key={n._id} href={hrefFor(n)}>
          <g className="cursor-pointer [&:hover_circle]:opacity-100 [&:hover_text]:fill-[var(--text)]">
            <circle cx={n.x} cy={n.y} r={n.r + 6} fill={KIND_COLOR[n.kind]} opacity={0.08} />
            <circle cx={n.x} cy={n.y} r={n.r} fill={n._id === "person:aditya" ? "var(--accent)" : "var(--panel-2)"} stroke={KIND_COLOR[n.kind]} strokeWidth={1.5} opacity={0.9} />
            <text x={n.x} y={n.y + n.r + 14} textAnchor="middle" fontSize={11} fill="var(--muted)" style={{ fontFamily: "var(--font-sans)" }}>
              {n._id === "person:aditya" ? "You" : n.name}
            </text>
            {n.n > 0 && n._id !== "person:aditya" && (
              <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={9} fill={KIND_COLOR[n.kind]} style={{ fontFamily: "var(--font-mono)" }}>
                {n.n}
              </text>
            )}
          </g>
        </Link>
      ))}
    </svg>
  );
}
