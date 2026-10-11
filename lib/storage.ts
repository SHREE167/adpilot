import "server-only";
import { sql } from "@vercel/postgres";
import { cloneRateCard, validateRateCard } from "./rate-card";
import { summarize } from "./summarize";
import type { PlanListItem, PlanResult, RateCard } from "./types";

interface MemoryBox {
  plans: Map<string, PlanResult>;
  lastResult: PlanResult | null;
  rateCard: RateCard;
  pgReady: boolean;
}

const g = globalThis as typeof globalThis & { __adpilot?: MemoryBox };

function mem(): MemoryBox {
  if (!g.__adpilot) {
    g.__adpilot = {
      plans: new Map(),
      lastResult: null,
      rateCard: cloneRateCard(),
      pgReady: false,
    };
  }
  return g.__adpilot;
}

export function hasPostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

async function ensureTables(): Promise<boolean> {
  if (!hasPostgres()) return false;
  const box = mem();
  if (box.pgReady) return true;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS adpilot_plans (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        result JSONB NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS adpilot_rate_card (
        id INT PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    box.pgReady = true;
    return true;
  } catch {
    return false;
  }
}

function remember(plan: PlanResult) {
  const box = mem();
  box.plans.set(plan.id, plan);
  box.lastResult = plan;
}

export async function savePlan(plan: PlanResult): Promise<void> {
  remember(plan);
  if (!(await ensureTables())) return;
  await sql`
    INSERT INTO adpilot_plans (id, created_at, result)
    VALUES (${plan.id}, ${plan.createdAt}, ${JSON.stringify(plan)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result
  `;
}

export async function getPlan(id: string): Promise<PlanResult | null> {
  const cached = mem().plans.get(id);
  if (cached) return cached;
  if (mem().lastResult?.id === id) return mem().lastResult;
  if (!(await ensureTables())) return null;
  const { rows } = await sql`SELECT result FROM adpilot_plans WHERE id = ${id} LIMIT 1`;
  if (!rows[0]) return null;
  const plan = rows[0].result as PlanResult;
  remember(plan);
  return plan;
}

export async function listPlans(): Promise<{
  source: "postgres" | "memory";
  plans: PlanListItem[];
}> {
  if (await ensureTables()) {
    const { rows } = await sql`
      SELECT result FROM adpilot_plans
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const plans = rows.map((r) => summarize(r.result as PlanResult));
    return { source: "postgres", plans };
  }
  const box = mem();
  const plans = [...box.plans.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(summarize);
  return { source: "memory", plans };
}

export async function getRateCard(): Promise<RateCard> {
  if (await ensureTables()) {
    const { rows } = await sql`SELECT data FROM adpilot_rate_card WHERE id = 1 LIMIT 1`;
    if (rows[0]?.data) {
      try {
        const card = validateRateCard(rows[0].data);
        mem().rateCard = card;
        return card;
      } catch {
        /* fall through to default */
      }
    }
  }
  return cloneRateCard(mem().rateCard);
}

export async function putRateCard(data: unknown): Promise<RateCard> {
  const card = validateRateCard(data);
  mem().rateCard = cloneRateCard(card);
  if (await ensureTables()) {
    await sql`
      INSERT INTO adpilot_rate_card (id, data, updated_at)
      VALUES (1, ${JSON.stringify(card)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;
  }
  return card;
}

export function storageMode(): "postgres" | "ephemeral" {
  return hasPostgres() ? "postgres" : "ephemeral";
}
