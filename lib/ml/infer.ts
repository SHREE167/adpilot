import "server-only";
import { describeFeature } from "@/lib/ml/feature-labels";
import { ML_FEATURE_NAMES } from "@/lib/ml/features";
import { hasCover, shapValues, type ShapNode } from "@/lib/ml/shap";
import type { ChannelId, ChannelShap } from "@/lib/types";
import modelJson from "../../ml/model.json";

/** Exported XGBoost node; `cover` (training rows reaching it) drives TreeSHAP. */
type TreeNode = ShapNode;

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
  node_stats?: string;
  self_check: { x: number[]; y: number[] }[];
}

const MODEL = modelJson as unknown as SavedModel;

function walk(node: TreeNode, x: number[]): number {
  if ("leaf" in node) return node.leaf;
  const v = x[node.index];
  return v < node.threshold ? walk(node.yes, x) : walk(node.no, x);
}

/** Raw model output (base_score + Σ leaves), not clamped. SHAP explains this. */
export function rawChannelScore(channelId: ChannelId, x: number[]): number {
  const m = MODEL.models[channelId];
  if (!m) return 0;
  let s = m.base_score;
  for (const tree of m.trees) s += walk(tree, x);
  return s;
}

export function predictChannelScore(channelId: ChannelId, x: number[]): number {
  return Math.max(0, Math.min(100, rawChannelScore(channelId, x)));
}

export function predictAllScores(x: number[]): Record<ChannelId, number> {
  const out = {} as Record<ChannelId, number>;
  for (const ch of MODEL.channels) {
    out[ch] = Math.round(predictChannelScore(ch, x));
  }
  return out;
}

/**
 * Exact TreeSHAP for one channel: base (expected score over the training
 * cover) → top drivers → the remaining features summed → raw prediction.
 * base + Σ drivers + other == prediction.
 */
export function shapForChannel(channelId: ChannelId, x: number[], top = 5): Omit<ChannelShap, "score"> {
  const m = MODEL.models[channelId];
  if (!m) return { channelId, base: 0, prediction: 0, drivers: [], other: 0, otherCount: 0 };
  const { base, phi, prediction } = shapValues(m, x, ML_FEATURE_NAMES.length);
  const ranked = phi
    .map((value, i) => ({ i, value }))
    .filter((d) => Math.abs(d.value) > 1e-9)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const drivers = ranked.slice(0, top).map(({ i, value }) => ({
    feature: ML_FEATURE_NAMES[i],
    label: describeFeature(ML_FEATURE_NAMES[i], x[i]),
    value,
  }));
  const rest = ranked.slice(top);
  return {
    channelId,
    base,
    prediction,
    drivers,
    other: rest.reduce((s, d) => s + d.value, 0),
    otherCount: rest.length,
  };
}

/** Score + the k strongest SHAP drivers as short reasons (signature kept from v1). */
export function explainScore(channelId: ChannelId, x: number[], k = 3): string[] {
  if (!MODEL.models[channelId]) return ["XGBoost model missing for this channel"];
  const s = shapForChannel(channelId, x, k);
  const score = Math.round(Math.max(0, Math.min(100, s.prediction)));
  return [
    `XGBoost score ${score}/100 (average ${s.base.toFixed(1)})`,
    ...s.drivers.map((d) => {
      const dir = d.value >= 0 ? "lifts" : "lowers";
      return `${d.label} ${dir} this channel (${d.value >= 0 ? "+" : ""}${d.value.toFixed(1)})`;
    }),
  ];
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
  for (const ch of MODEL.channels) {
    if (!MODEL.models[ch].trees.every(hasCover)) {
      throw new Error(`XGBoost model has no per-node cover for ${ch}; retrain with ml/train.py`);
    }
  }
  for (const row of MODEL.self_check) {
    for (let i = 0; i < MODEL.channels.length; i++) {
      const ch = MODEL.channels[i];
      const got = predictChannelScore(ch, row.x);
      if (Math.abs(got - row.y[i]) > 0.05) {
        throw new Error(`XGBoost self-check failed on ${ch}: ${got} vs ${row.y[i]}`);
      }
      // TreeSHAP must add up exactly: base + Σ phi == raw prediction.
      const { base, phi, prediction } = shapValues(MODEL.models[ch], row.x, ML_FEATURE_NAMES.length);
      const sum = base + phi.reduce((s, p) => s + p, 0);
      if (Math.abs(sum - prediction) > 1e-3 || Math.abs(prediction - rawChannelScore(ch, row.x)) > 1e-9) {
        throw new Error(`TreeSHAP additivity failed on ${ch}: ${sum} vs ${prediction}`);
      }
    }
  }
  checked = true;
}
