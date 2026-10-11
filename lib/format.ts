export function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function ctrPct(ctr: number): string {
  return `${(ctr * 100).toFixed(2)}%`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function newPlanId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `ap_${crypto.randomUUID()}`;
  }
  return `ap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseAgeMidpoint(audienceAge: string): number {
  const range = audienceAge.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (range) {
    return (Number(range[1]) + Number(range[2])) / 2;
  }
  const single = audienceAge.match(/(\d+)/);
  if (single) return Number(single[1]);
  return 28;
}

export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}
