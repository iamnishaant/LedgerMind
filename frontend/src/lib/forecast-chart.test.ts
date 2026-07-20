import { describe, it, expect } from "vitest";
import { monthLabel, buildForecastChartData } from "./forecast-chart";

describe("monthLabel", () => {
  it("formats a YYYY-MM string as short month + 2-digit year", () => {
    expect(monthLabel("2026-07")).toBe("Jul 26");
  });

  it("handles January and December correctly (month-boundary edge cases)", () => {
    expect(monthLabel("2026-01")).toBe("Jan 26");
    expect(monthLabel("2026-12")).toBe("Dec 26");
  });
});

describe("buildForecastChartData", () => {
  const history = [
    { month: "2026-05", total: 1000, partial: false },
    { month: "2026-06", total: 2000, partial: false },
    { month: "2026-07", total: 1500, partial: true },
  ];
  const forecast = [
    { month: "2026-08", projected: 1800 },
    { month: "2026-09", projected: 2100 },
  ];

  it("maps every history point with actual set and projected null", () => {
    const chart = buildForecastChartData(history, forecast);
    expect(chart[0]).toEqual({ month: "May 26", actual: 1000, projected: null });
    expect(chart[1]).toEqual({ month: "Jun 26", actual: 2000, projected: null });
  });

  it("joins the series at the last historical point so the dashed line connects with no gap", () => {
    const chart = buildForecastChartData(history, forecast);
    const lastHistoryPoint = chart[2];
    expect(lastHistoryPoint.month).toBe("Jul 26");
    expect(lastHistoryPoint.actual).toBe(1500);
    expect(lastHistoryPoint.projected).toBe(1500); // the join point — same value as `actual`
  });

  it("maps every forecast point with projected set and actual null", () => {
    const chart = buildForecastChartData(history, forecast);
    expect(chart[3]).toEqual({ month: "Aug 26", actual: null, projected: 1800 });
    // en-IN abbreviates September as "Sept" (4 letters), unlike en-US's "Sep" —
    // this is real Intl/ICU behavior, not a typo.
    expect(chart[4]).toEqual({ month: "Sept 26", actual: null, projected: 2100 });
  });

  it("produces exactly history.length + forecast.length points", () => {
    const chart = buildForecastChartData(history, forecast);
    expect(chart).toHaveLength(history.length + forecast.length);
  });

  it("handles empty history without crashing (no join point to set)", () => {
    const chart = buildForecastChartData([], forecast);
    expect(chart).toHaveLength(forecast.length);
    expect(chart[0].actual).toBeNull();
  });

  it("handles empty forecast (history only, e.g. horizon=0)", () => {
    const chart = buildForecastChartData(history, []);
    expect(chart).toHaveLength(history.length);
    // still joins: the last history point's `projected` gets set even with no forecast points to follow
    expect(chart[chart.length - 1].projected).toBe(1500);
  });

  it("handles both empty (no expense history at all)", () => {
    expect(buildForecastChartData([], [])).toEqual([]);
  });
});
