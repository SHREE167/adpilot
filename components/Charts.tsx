"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHANNEL_COLORS } from "@/lib/colors";
import { compactNumber, inr } from "@/lib/format";
import type { PlanResult } from "@/lib/types";

const tooltipStyle = {
  background: "#101826",
  border: "1px solid #2a3a52",
  borderRadius: 8,
  color: "#e8eef7",
  fontSize: 12,
};

export function MixPie({ plan }: { plan: PlanResult }) {
  const data = plan.mix.map((m) => ({
    name: m.name,
    value: m.budget,
    color: CHANNEL_COLORS[m.channelId],
  }));
  return (
    <ResponsiveContainer width="100%" height={420}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={3}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [inr(Number(value)), "Budget ESTIMATE"]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ImpressionsBar({ plan }: { plan: PlanResult }) {
  const data = plan.mix.map((m) => ({
    name: m.name.replace("Instagram ", "IG "),
    impressions: m.forecast.impressions,
    clicks: m.forecast.clicks,
    fill: CHANNEL_COLORS[m.channelId],
  }));
  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="#2a3a52" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fill: "#8b9bb4", fontSize: 11 }} interval={0} angle={-18} height={48} />
        <YAxis tick={{ fill: "#8b9bb4", fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
        <Tooltip
          contentStyle={tooltipStyle}
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

export function WeeklyLine({ plan }: { plan: PlanResult }) {
  return (
    <ResponsiveContainer width="100%" height={420}>
      <LineChart data={plan.weeklyForecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#2a3a52" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: "#8b9bb4", fontSize: 12 }} />
        <YAxis tick={{ fill: "#8b9bb4", fontSize: 11 }} tickFormatter={(v) => compactNumber(Number(v))} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            name === "spend" ? inr(Number(value)) : compactNumber(Number(value)),
            `${name} ESTIMATE`,
          ]}
        />
        <Legend />
        {plan.weeklyForecast
          .filter((w) => (w.cpmMultiplier ?? 1) > 1)
          .map((w) => (
            <ReferenceLine
              key={w.label}
              x={w.label}
              stroke="#e8c36a"
              strokeDasharray="4 4"
              label={{
                value: `${w.festival || "Festival"} · CPM +${Math.round(((w.cpmMultiplier ?? 1) - 1) * 100)}% ESTIMATE`,
                position: "insideTop",
                fill: "#e8c36a",
                fontSize: 11,
              }}
            />
          ))}
        <Line type="monotone" dataKey="impressions" stroke="#8fb3ff" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="clicks" stroke="#3ee0b1" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="spend" stroke="#f5c16c" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
