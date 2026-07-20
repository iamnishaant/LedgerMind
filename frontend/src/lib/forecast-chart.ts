/**
 * Pure chart-data shaping for the Forecasts page — extracted from
 * dashboard/forecasts/page.tsx so it's testable without rendering React.
 */

export interface ForecastHistoryPoint {
  month: string;
  total: number;
  partial: boolean;
}

export interface ForecastProjectionPoint {
  month: string;
  projected: number;
}

export interface ForecastChartPoint {
  month: string;
  actual: number | null;
  projected: number | null;
}

export function monthLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/**
 * Builds a single continuous series: actual for the past, projected for the
 * future, joined at the last historical point so the dashed projected line
 * connects cleanly to the solid actual line instead of leaving a gap.
 */
export function buildForecastChartData(
  history: ForecastHistoryPoint[],
  forecast: ForecastProjectionPoint[]
): ForecastChartPoint[] {
  const chart: ForecastChartPoint[] = [];

  history.forEach((h) => chart.push({ month: monthLabel(h.month), actual: h.total, projected: null }));
  if (chart.length) {
    chart[chart.length - 1].projected = history[history.length - 1].total;
  }
  forecast.forEach((f) => chart.push({ month: monthLabel(f.month), actual: null, projected: f.projected }));

  return chart;
}
