import "server-only";
import { ML_FEATURE_NAMES } from "@/lib/ml/features";
import type { ChannelId } from "@/lib/types";
import modelJson from "../../ml/model.json";

type TreeNode =
  | { leaf: number }
  | { feature: string; index: number; threshold: number; yes: TreeNode; no: TreeNode };

interface ChannelModel {
  base_score: number;
  trees: TreeNode[];
  importances: Record<string, number>;
}

interface SavedModel {
  type: string;
  algo: string;
  trained_on: string;
  feature_names: string[];
  channels: ChannelId[];
  metrics: Record<string, { r2: number; mae: number }>;
  mean_r2: number;
  mean_mae: number;
  models: Record<string, ChannelModel>;
  self_check: { x: number[]; y: number[] }[];
}

const MODEL = modelJson as SavedModel;

function walk(node: TreeNode, x: number[]): number {
  if ("leaf" in node) return node.leaf;
  const v = x[node.index];
  return v < node.threshold ? walk(node.yes, x) : walk(node.no, x);
}

export function predictChannelScore(channelId: ChannelId, x: number[]): number {
  const m = MODEL.models[channelId];
  if (!m) return 0;
  let s = m.base_score;
  for (const tree of m.trees) s += walk(tree, x);
  return Math.max(0, Math.min(100, s));
}

export function predictAllScores(x: number[]): Record<ChannelId, number> {
  const out = {} as Record<ChannelId, number>;
  for (const ch of MODEL.channels) {
    out[ch] = Math.round(predictChannelScore(ch, x));
  }
  return out;
}

export function explainScore(channelId: ChannelId, x: number[], k = 3): string[] {
  const m = MODEL.models[channelId];
  if (!m) return ["XGBoost model missing for this channel"];
  const base = predictChannelScore(channelId, x);
  const ranked = Object.entries(m.importances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const deltas: { name: string; delta: number }[] = [];
  for (const [name] of ranked) {
    const i = ML_FEATURE_NAMES.indexOf(name);
    if (i < 0) continue;
    const x0 = x.slice();
    x0[i] = 0;
    deltas.push({ name, delta: base - predictChannelScore(channelId, x0) });
  }
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const reasons = [
    `XGBoost score ${Math.round(base)}/100`,
    ...deltas.slice(0, k).map((d) => {
      const dir = d.delta >= 0 ? "lifts" : "lowers";
      return `${d.name} ${dir} this channel (${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(1)})`;
    }),
  ];
  return reasons;
}

export function modelCard(): {
  algo: string;
  trainedOn: string;
  meanR2: number;
  meanMae: number;
} {
  return {
    algo: MODEL.algo,
    trainedOn: MODEL.trained_on,
    meanR2: MODEL.mean_r2,
    meanMae: MODEL.mean_mae,
  };
}

let checked = false;

export function assertModelSelfCheck(): void {
  if (checked) return;
  if (MODEL.feature_names.join("|") !== ML_FEATURE_NAMES.join("|")) {
    throw new Error("XGBoost feature_names do not match lib/ml/features.ts");
  }
  for (const row of MODEL.self_check) {
    for (let i = 0; i < MODEL.channels.length; i++) {
      const got = predictChannelScore(MODEL.channels[i], row.x);
      if (Math.abs(got - row.y[i]) > 0.05) {
        throw new Error(
          `XGBoost self-check failed on ${MODEL.channels[i]}: ${got} vs ${row.y[i]}`
        );
      }
    }
  }
  checked = true;
}
