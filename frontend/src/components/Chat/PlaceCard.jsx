function formatDistance(meters) {
  if (!meters && meters !== 0) return "";
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function priceLabel(level) {
  if (level == null) return "";
  return "₹".repeat(Math.max(1, Number(level) || 1));
}

export default function PlaceCard({ place, index, onAction }) {
  const directionsUrl = place.latitude && place.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
    : place.mapsUrl;

  const placeLabel = place.name || `Place ${index + 1}`;

  return (
    <article className="group overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[color:var(--bg-card)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent-border)] hover:shadow-xl">
      <div className="h-1 bg-gradient-to-r from-violet-500 via-sky-400 to-emerald-400" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
              {place.category || place.types?.[0]?.replace(/_/g, " ") || "Place"}
            </p>
            <h3 className="mt-1 text-base font-semibold leading-snug text-[color:var(--text-primary)]">{placeLabel}</h3>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${place.openNow === false ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"}`}>
            {place.openNow === null || place.openNow === undefined ? "Status unknown" : place.openNow ? "Open now" : "Closed"}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-secondary)]">
          {place.rating && (
            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 font-semibold text-amber-500">
              ★ {place.rating}{place.totalReviews ? ` (${place.totalReviews})` : ""}
            </span>
          )}
          {formatDistance(place.distanceMeters) && (
            <span className="rounded-full bg-[color:var(--bg-elevated)] px-2.5 py-1">{formatDistance(place.distanceMeters)}</span>
          )}
          {priceLabel(place.priceLevel) && (
            <span className="rounded-full bg-[color:var(--bg-elevated)] px-2.5 py-1">{priceLabel(place.priceLevel)}</span>
          )}
        </div>

        <p className="mt-3 min-h-[38px] text-sm leading-6 text-[color:var(--text-secondary)]">{place.address || "Address unavailable"}</p>

        {(place.phoneNumber || place.website) && (
          <div className="mt-3 space-y-1 text-xs text-[color:var(--text-muted)]">
            {place.phoneNumber && <p className="truncate">Phone: {place.phoneNumber}</p>}
            {place.website && <a className="block truncate text-[color:var(--accent)]" href={place.website} target="_blank" rel="noreferrer">{place.website}</a>}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-violet-500 px-3 py-2 text-center text-xs font-semibold text-white">
            Open Maps
          </a>
          <a href={directionsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-center text-xs font-medium text-[color:var(--text-secondary)]">
            Directions
          </a>
          <button onClick={() => onAction?.(`Save ${placeLabel} as a task`)} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--text-secondary)]">
            Save task
          </button>
          <button onClick={() => onAction?.(`Add reminder for ${placeLabel}`)} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--text-secondary)]">
            Add reminder
          </button>
        </div>
        <button onClick={() => onAction?.(`Tell me more about ${placeLabel}`)} className="mt-2 w-full rounded-xl bg-[color:var(--accent-bg)] px-3 py-2 text-xs font-medium text-[color:var(--accent)]">
          Ask Aura about this place
        </button>
      </div>
    </article>
  );
}
