"""
Train one XGBoost regressor per ad channel.

Labels come from a simulator (audience × category × rate-card affordability).
We do not have live Meta/Google delivery data, so this is synthetic India
planning data. The Next.js app loads only the fitted trees, not this simulator.

Usage:
  ml\\.venv\\Scripts\\python ml\\train.py
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "model.json"

CHANNELS = [
    "google_search",
    "google_display",
    "youtube",
    "instagram_reels",
    "instagram_feed",
    "facebook",
    "whatsapp",
    "sharechat",
    "linkedin",
    "telegram",
    "reddit",
    "x",
]

CATEGORIES = [
    "food",
    "saas",
    "education",
    "fashion",
    "health",
    "finance",
    "ecommerce",
    "local_service",
    "entertainment",
    "general",
]

GOALS = ["awareness", "sales", "leads", "store_visits", "app_installs", "b2b"]

FEATURE_NAMES = (
    [
        "log_budget",
        "age",
        "price_tier",
        "metro",
        "vernacular",
        "student",
        "professional",
        "b2b",
        "local",
    ]
    + [f"cat_{c}" for c in CATEGORIES]
    + [f"goal_{g}" for g in GOALS]
)

# Relative CPM — expensive channels need budget.
CPM = {
    "google_search": 180,
    "google_display": 40,
    "youtube": 70,
    "instagram_reels": 90,
    "instagram_feed": 80,
    "facebook": 60,
    "whatsapp": 20,
    "sharechat": 35,
    "linkedin": 250,
    "telegram": 25,
    "reddit": 80,
    "x": 70,
}

AFFINITY = {
    "food": {
        "google_search": 0.45,
        "google_display": 0.55,
        "youtube": 0.72,
        "instagram_reels": 0.95,
        "instagram_feed": 0.78,
        "facebook": 0.62,
        "whatsapp": 0.92,
        "sharechat": 0.80,
        "linkedin": 0.08,
        "telegram": 0.28,
        "reddit": 0.12,
        "x": 0.18,
    },
    "saas": {
        "google_search": 0.90,
        "google_display": 0.35,
        "youtube": 0.48,
        "instagram_reels": 0.28,
        "instagram_feed": 0.30,
        "facebook": 0.38,
        "whatsapp": 0.22,
        "sharechat": 0.10,
        "linkedin": 0.96,
        "telegram": 0.58,
        "reddit": 0.82,
        "x": 0.76,
    },
    "education": {
        "google_search": 0.82,
        "google_display": 0.50,
        "youtube": 0.88,
        "instagram_reels": 0.70,
        "instagram_feed": 0.55,
        "facebook": 0.60,
        "whatsapp": 0.65,
        "sharechat": 0.55,
        "linkedin": 0.40,
        "telegram": 0.50,
        "reddit": 0.35,
        "x": 0.32,
    },
    "fashion": {
        "google_search": 0.55,
        "google_display": 0.60,
        "youtube": 0.70,
        "instagram_reels": 0.94,
        "instagram_feed": 0.90,
        "facebook": 0.58,
        "whatsapp": 0.70,
        "sharechat": 0.60,
        "linkedin": 0.15,
        "telegram": 0.25,
        "reddit": 0.20,
        "x": 0.30,
    },
    "health": {
        "google_search": 0.80,
        "google_display": 0.45,
        "youtube": 0.55,
        "instagram_reels": 0.50,
        "instagram_feed": 0.48,
        "facebook": 0.70,
        "whatsapp": 0.68,
        "sharechat": 0.40,
        "linkedin": 0.35,
        "telegram": 0.30,
        "reddit": 0.25,
        "x": 0.22,
    },
    "finance": {
        "google_search": 0.92,
        "google_display": 0.40,
        "youtube": 0.50,
        "instagram_reels": 0.35,
        "instagram_feed": 0.38,
        "facebook": 0.55,
        "whatsapp": 0.40,
        "sharechat": 0.25,
        "linkedin": 0.70,
        "telegram": 0.45,
        "reddit": 0.40,
        "x": 0.48,
    },
    "ecommerce": {
        "google_search": 0.85,
        "google_display": 0.65,
        "youtube": 0.60,
        "instagram_reels": 0.80,
        "instagram_feed": 0.82,
        "facebook": 0.70,
        "whatsapp": 0.75,
        "sharechat": 0.50,
        "linkedin": 0.20,
        "telegram": 0.30,
        "reddit": 0.28,
        "x": 0.35,
    },
    "local_service": {
        "google_search": 0.78,
        "google_display": 0.55,
        "youtube": 0.40,
        "instagram_reels": 0.60,
        "instagram_feed": 0.55,
        "facebook": 0.85,
        "whatsapp": 0.90,
        "sharechat": 0.55,
        "linkedin": 0.18,
        "telegram": 0.22,
        "reddit": 0.10,
        "x": 0.15,
    },
    "entertainment": {
        "google_search": 0.40,
        "google_display": 0.55,
        "youtube": 0.92,
        "instagram_reels": 0.90,
        "instagram_feed": 0.70,
        "facebook": 0.55,
        "whatsapp": 0.45,
        "sharechat": 0.70,
        "linkedin": 0.12,
        "telegram": 0.50,
        "reddit": 0.65,
        "x": 0.72,
    },
    "general": {
        "google_search": 0.60,
        "google_display": 0.50,
        "youtube": 0.55,
        "instagram_reels": 0.62,
        "instagram_feed": 0.58,
        "facebook": 0.55,
        "whatsapp": 0.58,
        "sharechat": 0.45,
        "linkedin": 0.35,
        "telegram": 0.40,
        "reddit": 0.35,
        "x": 0.40,
    },
}

AGE_PEAK = {
    "google_search": 32,
    "google_display": 34,
    "youtube": 24,
    "instagram_reels": 22,
    "instagram_feed": 26,
    "facebook": 38,
    "whatsapp": 30,
    "sharechat": 23,
    "linkedin": 34,
    "telegram": 28,
    "reddit": 27,
    "x": 29,
}

GOAL_BOOST = {
    "awareness": {
        "youtube": 0.15,
        "google_display": 0.18,
        "instagram_reels": 0.12,
        "facebook": 0.08,
        "x": 0.08,
        "google_search": -0.08,
    },
    "sales": {
        "google_search": 0.16,
        "whatsapp": 0.12,
        "instagram_reels": 0.08,
        "instagram_feed": 0.08,
    },
    "leads": {
        "google_search": 0.18,
        "linkedin": 0.12,
        "facebook": 0.06,
        "whatsapp": 0.08,
    },
    "store_visits": {
        "facebook": 0.16,
        "whatsapp": 0.14,
        "google_search": 0.10,
        "google_display": 0.08,
        "linkedin": -0.10,
    },
    "app_installs": {
        "instagram_reels": 0.12,
        "google_display": 0.10,
        "youtube": 0.08,
        "facebook": 0.08,
    },
    "b2b": {
        "linkedin": 0.22,
        "google_search": 0.14,
        "reddit": 0.10,
        "x": 0.08,
        "sharechat": -0.16,
        "instagram_reels": -0.10,
        "whatsapp": -0.10,
    },
}

METROS = [
    "mumbai",
    "delhi",
    "bengaluru",
    "bangalore",
    "chennai",
    "hyderabad",
    "kolkata",
    "pune",
    "ahmedabad",
    "kochi",
    "noida",
    "gurgaon",
    "gurugram",
]
TIER2 = ["coimbatore", "madurai", "jaipur", "lucknow", "indore", "nagpur", "surat", "patna"]
LANGS = ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali"]


def sigmoid(z: float) -> float:
    z = max(-20, min(20, z))
    return 1.0 / (1.0 + math.exp(-z))


def gauss(x: float, mu: float, sigma: float = 10.0) -> float:
    return math.exp(-((x - mu) ** 2) / (2 * sigma * sigma))


def label_scores(feat: dict) -> dict[str, float]:
    out = {}
    budget = math.exp(feat["log_budget"])
    for ch in CHANNELS:
        aff = AFFINITY[feat["category"]][ch]
        age_fit = gauss(feat["age"], AGE_PEAK[ch])
        goal = GOAL_BOOST[feat["goal"]].get(ch, 0.0)
        afford = sigmoid((math.log(budget) - math.log(max(CPM[ch] * 40, 1))) / 0.8)
        vern = 0.0
        if ch == "sharechat":
            vern = 0.18 if feat["vernacular"] else -0.16
        elif ch in ("reddit", "x", "linkedin"):
            vern = -0.08 if feat["vernacular"] else 0.08
        elif ch in ("instagram_reels", "whatsapp"):
            vern = 0.06 if feat["vernacular"] else 0.0
        metro = 0.04 if feat["metro"] and ch in ("instagram_reels", "youtube", "x") else 0.0
        if not feat["metro"] and ch == "sharechat":
            metro = 0.08
        local = 0.0
        if feat["local"] and ch in ("whatsapp", "facebook"):
            local = 0.12
        if feat["student"] and ch in ("instagram_reels", "sharechat", "youtube"):
            local += 0.08
        if feat["student"] and ch == "linkedin":
            local -= 0.20
        if feat["professional"] and ch == "linkedin":
            local += 0.10
        if feat["b2b"] and ch in ("linkedin", "google_search", "reddit"):
            local += 0.08
        z = (
            2.4 * aff
            + 1.2 * age_fit
            + 1.1 * goal
            + 0.9 * afford
            + vern
            + metro
            + local
            - 1.35
        )
        score = 100.0 * sigmoid(z)
        out[ch] = score
    return out


def random_row(rng: random.Random) -> tuple[list[float], dict, dict]:
    category = rng.choice(CATEGORIES)
    goal = rng.choice(GOALS)
    if category == "saas" and rng.random() < 0.45:
        goal = "b2b"
    if category == "food" and rng.random() < 0.4:
        goal = rng.choice(["sales", "awareness", "store_visits"])
    budget = math.exp(rng.uniform(math.log(800), math.log(250000)))
    age = rng.uniform(16, 54)
    metro = 1.0 if rng.random() < 0.55 else 0.0
    language = rng.choice(LANGS)
    vernacular = 0.0 if language == "English" else 1.0
    student = 1.0 if age < 24 and rng.random() < 0.6 else 0.0
    professional = 1.0 if (category == "saas" or goal == "b2b" or (age > 26 and rng.random() < 0.35)) else 0.0
    b2b = 1.0 if (goal == "b2b" or category == "saas") else 0.0
    local = 1.0 if (category in ("food", "local_service") or goal == "store_visits") else 0.0
    if budget < 5000 or category == "food" or student:
        price_tier = 0.0
    elif category == "saas" or b2b:
        price_tier = 3.0 if budget >= 50000 else 2.0
    else:
        price_tier = 1.0

    feat = {
        "log_budget": math.log(budget),
        "age": age,
        "price_tier": price_tier,
        "metro": metro,
        "vernacular": vernacular,
        "student": student,
        "professional": professional,
        "b2b": b2b,
        "local": local,
        "category": category,
        "goal": goal,
    }
    x = [
        feat["log_budget"],
        feat["age"],
        feat["price_tier"],
        feat["metro"],
        feat["vernacular"],
        feat["student"],
        feat["professional"],
        feat["b2b"],
        feat["local"],
    ]
    x += [1.0 if c == category else 0.0 for c in CATEGORIES]
    x += [1.0 if g == goal else 0.0 for g in GOALS]
    y = label_scores(feat)
    # modest noise so the model has to generalize, not memorize
    for ch in CHANNELS:
        y[ch] = float(np.clip(y[ch] + rng.gauss(0, 3.5), 0, 100))
    return x, y, feat


def dump_tree(node: dict, feature_names: list[str]) -> dict:
    if "leaf" in node:
        return {"leaf": float(node["leaf"])}
    split = node["split"]
    if isinstance(split, str) and split.startswith("f") and split[1:].isdigit():
        idx = int(split[1:])
        name = feature_names[idx]
    else:
        name = str(split)
        idx = feature_names.index(name)
    children = {c["nodeid"]: c for c in node.get("children", [])}
    yes = dump_tree(children[node["yes"]], feature_names)
    no = dump_tree(children[node["no"]], feature_names)
    return {
        "feature": name,
        "index": idx,
        "threshold": float(node["split_condition"]),
        "yes": yes,
        "no": no,
    }


def predict_tree(node: dict, x: list[float]) -> float:
    if "leaf" in node:
        return node["leaf"]
    v = x[node["index"]]
    branch = node["yes"] if v < node["threshold"] else node["no"]
    return predict_tree(branch, x)


def main() -> None:
    rng = random.Random(42)
    n = 12000
    X = []
    Y = {ch: [] for ch in CHANNELS}
    for _ in range(n):
        x, y, _ = random_row(rng)
        X.append(x)
        for ch in CHANNELS:
            Y[ch].append(y[ch])
    X = np.asarray(X, dtype=np.float32)

    models = {}
    metrics = {}
    idx = np.arange(n)
    train_i, test_i = train_test_split(idx, test_size=0.2, random_state=42)

    for ch in CHANNELS:
        y = np.asarray(Y[ch], dtype=np.float32)
        model = XGBRegressor(
            n_estimators=48,
            max_depth=4,
            learning_rate=0.12,
            subsample=0.85,
            colsample_bytree=0.8,
            min_child_weight=4,
            objective="reg:squarederror",
            n_jobs=4,
            random_state=42,
            tree_method="hist",
        )
        model.fit(X[train_i], y[train_i])
        pred = model.predict(X[test_i])
        metrics[ch] = {
            "r2": round(float(r2_score(y[test_i], pred)), 4),
            "mae": round(float(mean_absolute_error(y[test_i], pred)), 3),
        }
        booster = model.get_booster()
        raw_trees = [json.loads(t) for t in booster.get_dump(dump_format="json")]
        trees = [dump_tree(t, FEATURE_NAMES) for t in raw_trees]
        cfg = json.loads(booster.save_config())
        base = cfg["learner"]["learner_model_param"]["base_score"]
        if isinstance(base, str):
            base = float(base.strip("[]").split(",")[0])
        else:
            base = float(base)
        importances = {
            FEATURE_NAMES[i]: round(float(v), 4)
            for i, v in enumerate(model.feature_importances_)
            if float(v) > 0.01
        }
        models[ch] = {
            "base_score": base,
            "trees": trees,
            "importances": importances,
        }
        print(f"{ch:16s}  R2={metrics[ch]['r2']:.3f}  MAE={metrics[ch]['mae']:.2f}")

    # self-check vectors the TS runtime must match
    checks = []
    for seed in (1, 7, 99):
        x, _, feat = random_row(random.Random(seed))
        yhat = []
        for ch in CHANNELS:
            m = models[ch]
            s = m["base_score"] + sum(predict_tree(t, x) for t in m["trees"])
            yhat.append(round(float(s), 5))
        checks.append({"x": [round(float(v), 6) for v in x], "y": yhat, "meta": {
            "category": feat["category"],
            "goal": feat["goal"],
            "budget": round(math.exp(feat["log_budget"])),
        }})

    payload = {
        "type": "xgboost-gbtree",
        "algo": "XGBoost regressor (one model per channel)",
        "trained_on": "12000 synthetic India media-planning briefs (no live ad APIs)",
        "feature_names": FEATURE_NAMES,
        "channels": CHANNELS,
        "metrics": metrics,
        "mean_r2": round(float(np.mean([m["r2"] for m in metrics.values()])), 4),
        "mean_mae": round(float(np.mean([m["mae"] for m in metrics.values()])), 3),
        "models": models,
        "self_check": checks,
    }
    OUT.write_text(json.dumps(payload), encoding="utf-8")
    print(f"\nWrote {OUT}  mean R2={payload['mean_r2']}  mean MAE={payload['mean_mae']}")


if __name__ == "__main__":
    main()
