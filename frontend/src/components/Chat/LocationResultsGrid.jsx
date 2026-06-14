import PlaceCard from "./PlaceCard";
import PlaceCardSkeleton from "./PlaceCardSkeleton";

export default function LocationResultsGrid({ query, locationLabel, places = [], loading = false, error = "", onAction }) {
  if (loading) {
    return (
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PlaceCardSkeleton />
        <PlaceCardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-3xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!places.length) {
    return (
      <div className="mt-4 rounded-3xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-5 text-sm text-[color:var(--text-secondary)]">
        No places found. Try a different area, category, or manual location.
      </div>
    );
  }

  return (
    <section className="mt-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">Location results</p>
          <h3 className="text-base font-semibold text-[color:var(--text-primary)]">
            {query || "Places"}{locationLabel ? ` near ${locationLabel}` : ""}
          </h3>
        </div>
        <span className="rounded-full bg-[color:var(--accent-bg)] px-3 py-1 text-xs font-medium text-[color:var(--accent)]">
          {places.length} found
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {places.map((place, index) => (
          <PlaceCard key={place.placeId || `${place.name}-${index}`} place={place} index={index} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}
