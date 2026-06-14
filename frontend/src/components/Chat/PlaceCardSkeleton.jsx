export default function PlaceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-4">
      <div className="h-3 w-24 rounded-full bg-[color:var(--bg-elevated)]" />
      <div className="mt-3 h-5 w-3/4 rounded-full bg-[color:var(--bg-elevated)]" />
      <div className="mt-4 flex gap-2">
        <div className="h-7 w-20 rounded-full bg-[color:var(--bg-elevated)]" />
        <div className="h-7 w-16 rounded-full bg-[color:var(--bg-elevated)]" />
      </div>
      <div className="mt-4 h-4 w-full rounded-full bg-[color:var(--bg-elevated)]" />
      <div className="mt-2 h-4 w-4/5 rounded-full bg-[color:var(--bg-elevated)]" />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="h-9 rounded-xl bg-[color:var(--bg-elevated)]" />
        <div className="h-9 rounded-xl bg-[color:var(--bg-elevated)]" />
      </div>
    </div>
  );
}
