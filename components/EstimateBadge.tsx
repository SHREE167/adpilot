export function EstimateBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-sand/40 bg-sand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sand ${className}`}
    >
      ESTIMATE
    </span>
  );
}
