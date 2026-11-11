export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-3 w-32 rounded bg-panel-2 animate-pulse-soft" />
      <div className="h-12 w-2/3 rounded-lg bg-panel-2 animate-pulse-soft" />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 glass rounded-3xl animate-pulse-soft" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
