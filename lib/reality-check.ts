import benchmarksJson from "@/data/benchmarks.json";
import { inr } from "./format";
import type { ConversionBenchmark, PlanInput, RealityCheck, RealityVerdict } from "./types";

type Band = Omit<ConversionBenchmark, "goal">;

export interface BenchmarkTable {
  goals: Record<string, Band>;
}

export const BENCHMARKS = benchmarksJson as BenchmarkTable;

/** Price + margin only count as a pair; anything else skips F8 silently. */
export function hasRealityInputs(input: PlanInput): input is PlanInput & { price: number; margin: number } {
  return (
    typeof input.price === "number" &&
    typeof input.margin === "number" &&
    input.price > 0 &&
    input.margin > 0
  );
}

export function benchmarkFor(goal: string, table: BenchmarkTable = BENCHMARKS): ConversionBenchmark {
  const id = String(goal).toLowerCase();
  const band = table.goals[id] ?? table.goals.sales;
  return { goal: table.goals[id] ? id : "sales", ...band };
}

/** Healthy at or under typical, Tight up to 2x typical, Likely loss beyond. */
export function verdictFor(ratio: number | null): RealityVerdict {
  if (ratio === null) return "likely_loss";
  if (ratio <= 1) return "healthy";
  if (ratio <= 2) return "tight";
  return "likely_loss";
}

/**
 * A smaller first test: about 20% of the budget, rounded to ₹500, at least ₹500,
 * never above the budget. Required conversion does not change with budget; a test
 * only caps the loss while the real rate is learned.
 */
export function testBudgetFor(budget: number): number {
  return Math.min(budget, Math.max(500, Math.round((budget * 0.2) / 500) * 500));
}

/** "3.1%", "0.25%", "12%": enough digits to be honest, no more. */
export function cvrPct(fraction: number): string {
  const p = fraction * 100;
  const digits = p >= 10 ? 0 : p >= 1 ? 1 : 2;
  return `${Number(p.toFixed(digits))}%`;
}

function units(n: number): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? "sale" : "sales"}`;
}

/**
 * F8: break-even reality check. Pure; returns undefined when the brief has no
 * price/margin pair. Never blocks the plan.
 *   profitPerSale = price × margin
 *   breakEvenUnits = ceil(budget / profitPerSale)
 *   requiredCvr = breakEvenUnits / forecast clicks
 */
export function buildRealityCheck(
  args: { input: PlanInput; clicks: number },
  table: BenchmarkTable = BENCHMARKS
): RealityCheck | undefined {
  const { input } = args;
  if (!hasRealityInputs(input)) return undefined;
  const budget = input.budget;
  const marginPct = input.margin;
  const profitPerSale = input.price * (marginPct / 100);
  const breakEvenUnits = Math.ceil(budget / profitPerSale);
  const clicks = Math.max(0, Math.round(args.clicks));
  const requiredCvr = clicks > 0 ? breakEvenUnits / clicks : null;
  const benchmark = benchmarkFor(String(input.goal), table);
  const ratio = requiredCvr === null ? null : requiredCvr / benchmark.typical;
  const verdict = verdictFor(ratio);

  const headline = `You need ${units(breakEvenUnits)} to break even.`;
  const detail =
    requiredCvr === null
      ? "The plan forecasts no clicks, so no conversion rate can break even."
      : `That needs a ${cvrPct(requiredCvr)} conversion rate; typical is ~${cvrPct(benchmark.typical)} (ESTIMATE).`;

  let advice: string;
  let testBudget: number | undefined;
  if (verdict === "healthy") {
    advice = "Break-even looks reachable at typical conversion rates. Track every sale from day one to confirm it.";
  } else {
    testBudget = testBudgetFor(budget);
    const lead =
      verdict === "tight"
        ? `Possible, but you need ${ratio!.toFixed(1)}× the typical rate.`
        : "At typical conversion rates this budget is likely to lose money.";
    advice =
      testBudget < budget
        ? `${lead} Start with a ${inr(testBudget)} test or do the free actions first.`
        : `${lead} Do the free actions first and treat this month as a test.`;
  }

  return {
    price: input.price,
    marginPct,
    profitPerSale: Math.round(profitPerSale * 100) / 100,
    budget,
    breakEvenUnits,
    clicks,
    requiredCvr,
    benchmark,
    ratio,
    verdict,
    headline,
    detail,
    advice,
    ...(testBudget !== undefined ? { testBudget } : {}),
  };
}
