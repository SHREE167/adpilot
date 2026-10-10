import { EstimateBadge } from "@/components/EstimateBadge";
import { provenanceOf, shortDate, sourceLabel } from "@/lib/sources";
import type { Signal } from "@/lib/types";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap";

/**
 * Where a number came from. LIVE · source · date (mint), MOCK · source (ice, fixture
 * data, never shown as live), muted Not connected, or ESTIMATE (sand).
 */
export function ProvenanceBadge({
  signal,
  estimate = false,
  className = "",
}: {
  signal?: Signal<unknown>;
  estimate?: boolean;
  className?: string;
}) {
  if (estimate) return <EstimateBadge className={className} />;
  const kind = provenanceOf(signal);
  if (kind === "off") {
    return (
      <span
        className={`${PILL} border-white/15 bg-white/[0.03] text-fog/70 ${className}`}
        title={signal?.reason || "Source not connected"}
      >
        Not connected
      </span>
    );
  }
  const label = sourceLabel(signal!.source);
  const date = shortDate(signal!.fetchedAt);
  if (kind === "mock") {
    return (
      <span
        className={`${PILL} border-ice/40 bg-ice/10 text-ice ${className}`}
        title="Fixture data (ADPILOT_MOCK_APIS=1), not live"
      >
        Mock · {label}
      </span>
    );
  }
  return (
    <span
      className={`${PILL} border-mint/40 bg-mint/10 text-mint ${className}`}
      title={signal!.cached ? `Cached; fetched ${date}` : `Fetched ${date}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint" />
      Live · {label} · {date}
    </span>
  );
}
