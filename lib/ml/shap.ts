// Exact TreeSHAP (Lundberg, Erion & Lee 2018, "Consistent Individualized
// Feature Attribution for Tree Ensembles", Algorithm 2) over the exported
// XGBoost JSON trees. Pure TypeScript, no dependencies, client-safe.
//
// Path-dependent SHAP: a feature absent from the coalition follows both
// children, weighted by training cover. For every x:
//   base + Σ phi == raw prediction (base_score + Σ tree leaves)
// where base = base_score + Σ cover-weighted mean leaf of each tree.

export type ShapNode =
  | { leaf: number; cover: number }
  | {
      feature?: string;
      index: number;
      threshold: number;
      cover: number;
      yes: ShapNode;
      no: ShapNode;
    };

export interface ShapModel {
  base_score: number;
  trees: ShapNode[];
}

export interface ShapResult {
  /** Expected model output over the training cover (the waterfall start). */
  base: number;
  /** One value per feature; Σ phi = prediction - base. */
  phi: number[];
  /** Raw (unclamped) model output for x. */
  prediction: number;
}

/** One element of the unique path: feature, zero/one fractions, permutation weight. */
interface PathElem {
  d: number;
  z: number;
  o: number;
  w: number;
}

function isLeaf(n: ShapNode): n is { leaf: number; cover: number } {
  return "leaf" in n;
}

export function hasCover(node: ShapNode): boolean {
  if (typeof node.cover !== "number" || !(node.cover > 0)) return false;
  return isLeaf(node) || (hasCover(node.yes) && hasCover(node.no));
}

/** XGBoost goes left ("yes") when x < threshold. */
function walk(node: ShapNode, x: readonly number[]): number {
  let n = node;
  while (!isLeaf(n)) n = x[n.index] < n.threshold ? n.yes : n.no;
  return n.leaf;
}

/** Cover-weighted mean leaf value: E[f(X)] under the training distribution. */
export function treeExpectation(node: ShapNode): number {
  if (isLeaf(node)) return node.leaf;
  const e = node.yes.cover * treeExpectation(node.yes) + node.no.cover * treeExpectation(node.no);
  return e / (node.yes.cover + node.no.cover);
}

function extend(m: PathElem[], pz: number, po: number, pi: number): PathElem[] {
  const l = m.length;
  const out = m.map((e) => ({ ...e }));
  out.push({ d: pi, z: pz, o: po, w: l === 0 ? 1 : 0 });
  for (let i = l - 1; i >= 0; i--) {
    out[i + 1].w += (po * out[i].w * (i + 1)) / (l + 1);
    out[i].w = (pz * out[i].w * (l - i)) / (l + 1);
  }
  return out;
}

function unwind(m: PathElem[], i: number): PathElem[] {
  const l = m.length - 1;
  const out = m.map((e) => ({ ...e }));
  let n = out[l].w;
  const { z, o } = out[i];
  for (let j = l - 1; j >= 0; j--) {
    if (o !== 0) {
      const t = out[j].w;
      out[j].w = (n * (l + 1)) / ((j + 1) * o);
      n = t - (out[j].w * z * (l - j)) / (l + 1);
    } else {
      out[j].w = (out[j].w * (l + 1)) / (z * (l - j));
    }
  }
  for (let j = i; j < l; j++) {
    out[j].d = out[j + 1].d;
    out[j].z = out[j + 1].z;
    out[j].o = out[j + 1].o;
  }
  out.pop();
  return out;
}

/** Sum of the path weights after unwinding element i (Algorithm 2, line 7). */
function unwoundSum(m: PathElem[], i: number): number {
  return unwind(m, i).reduce((s, e) => s + e.w, 0);
}

/** Adds one tree's SHAP values for x into phi. */
export function treeShap(tree: ShapNode, x: readonly number[], phi: number[]): void {
  const recurse = (node: ShapNode, path: PathElem[], pz: number, po: number, pi: number) => {
    let m = extend(path, pz, po, pi);
    if (isLeaf(node)) {
      for (let i = 1; i < m.length; i++) {
        phi[m[i].d] += unwoundSum(m, i) * (m[i].o - m[i].z) * node.leaf;
      }
      return;
    }
    const goYes = x[node.index] < node.threshold;
    const hot = goYes ? node.yes : node.no;
    const cold = goYes ? node.no : node.yes;
    let iz = 1;
    let io = 1;
    const k = m.findIndex((e, idx) => idx > 0 && e.d === node.index);
    if (k > 0) {
      iz = m[k].z;
      io = m[k].o;
      m = unwind(m, k);
    }
    recurse(hot, m, (iz * hot.cover) / node.cover, io, node.index);
    recurse(cold, m, (iz * cold.cover) / node.cover, 0, node.index);
  };
  recurse(tree, [], 1, 1, -1);
}

/** Exact SHAP values of one gradient-boosted model (sum of trees + base_score). */
export function shapValues(model: ShapModel, x: readonly number[], nFeatures = x.length): ShapResult {
  const phi = new Array<number>(nFeatures).fill(0);
  let base = model.base_score;
  let prediction = model.base_score;
  for (const tree of model.trees) {
    base += treeExpectation(tree);
    prediction += walk(tree, x);
    treeShap(tree, x, phi);
  }
  return { base, phi, prediction };
}
