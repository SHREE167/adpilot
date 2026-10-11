"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/components/ThemeToggle";
import { compactNumber, inr } from "@/lib/format";
import { channelColors, THEME_PALETTE } from "@/lib/theme";
import { totalsRangesOf } from "@/lib/ranges";
import type { PlanResult } from "@/lib/types";

/** Colours for the active theme; channel colours are lifted to >= 3:1 on the card surface. */
function useChartTheme() {
  const theme = useTheme();
  const p = THEME_PALETTE[theme];
  return {
    p,
    channel: channelColors(theme),
    tooltip: {
      background: p.surface,
      border: `1px solid ${p.rule}`,
      borderRadius: 8,
      color: p.text,
      fontSize: 12,
    },
    tick: { fill: p.muted, fontSize: 11 },
  };
}

export function MixPie({ plan }: { plan: PlanResult }) {
  const c = useChartTheme();
  const data = plan.mix.map((m) => ({
    name: m.name,
    value: m.budget,
    color: c.channel[m.channelId],
  }));
  return (
    <ResponsiveContainer width="100%" height={420}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={90}
          paddingAngle={3}
          stroke={c.p.surface}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={c.tooltip}
          formatter={(value) => [inr(Number(value)), "Budget ESTIMATE"]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ImpressionsBar({ plan }: { plan: PlanResult }) {
  const c = useChartTheme();
  const data = plan.mix.map((m) => ({
    name: m.name.replace("Instagram ", "IG "),
    impressions: m.forecast.impressions,
    clicks: m.forecast.clicks,
    fill: c.channel[m.channelId],
  }));
  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={c.p.rule} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={c.tick} interval={0} angle={-18} height={48} />
        <YAxis tick={c.tick} tickFormatter={(v) => compactNumber(Number(v))} />
        <Tooltip
          contentStyle={c.tooltip}
          formatter={(value, name) => [
            compactNumber(Number(value)),
            `${name} ESTIMATE`,
          ]}
        />
        <Bar dataKey="impressions" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** F14: weekly clicks get the plan's clicks band (same low/mid and high/mid ratios as the totals). */
export function weeklyWithBands(plan: PlanResult) {
  const r = totalsRangesOf(plan.totals, plan.mix.map((m) => m.forecast)).clicks;
  const lo = r.mid > 0 ? r.low / r.mid : 1;
  const hi = r.mid > 0 ? r.high / r.mid : 1;
  return plan.weeklyForecast.map((w) => ({
    ...w,
    clicksBand: [Math.floor(w.clicks * lo), Math.ceil(w.clicks * hi)] as [number, number],
  }));
}

export function WeeklyLine({ plan }: { plan: PlanResult }) {
  const c = useChartTheme();
  const [impressions, clicks, spend] = c.p.series;
  return (
    <ResponsiveContainer width="100%" height={420}>
      <ComposedChart data={weeklyWithBands(plan)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.p.rule} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ ...c.tick, fontSize: 12 }} />
        <YAxis tick={c.tick} tickFormatter={(v) => compactNumber(Number(v))} />
        <Tooltip
          contentStyle={c.tooltip}
          formatter={(value, name) => [
            Array.isArray(value)
              ? `${compactNumber(Number(value[0]))}–${compactNumber(Number(value[1]))}`
              : name === "spend"
                ? inr(Number(value))
                : compactNumber(Number(value)),
            Array.isArray(value) ? "clicks range (default band ±30%)" : `${name} ESTIMATE`,
          ]}
        />
        <Legend />
        {plan.weeklyForecast
          .filter((w) => (w.cpmMultiplier ?? 1) > 1)
          .map((w) => (
            <ReferenceLine
              key={w.label}
              x={w.label}
              stroke={c.p.accent}
              strokeDasharray="4 4"
              label={{
                value: `${w.festival || "Festival"} · CPM +${Math.round(((w.cpmMultiplier ?? 1) - 1) * 100)}% ESTIMATE`,
                position: "insideTop",
                fill: c.p.accent,
                fontSize: 11,
              }}
            />
          ))}
        <Area
          type="monotone"
          dataKey="clicksBand"
          name="clicks range"
          stroke="none"
          fill={clicks}
          fillOpacity={0.18}
          isAnimationActive={false}
          legendType="square"
        />
        <Line type="monotone" dataKey="impressions" stroke={impressions} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="clicks" stroke={clicks} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="spend" stroke={spend} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
