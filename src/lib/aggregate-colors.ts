/**
 * Returns a stable CSS variable index (0-7) for an aggregate name.
 * Sorting all aggregates alphabetically ensures consistent assignment
 * regardless of load order.
 */
export function getAggregateColorIndex(aggregate: string, allAggregates: string[]): number {
  const sorted = [...allAggregates].sort();
  const idx = sorted.indexOf(aggregate);
  return idx >= 0 ? idx % 8 : 0;
}

/**
 * Returns the CSS variable name for an aggregate's border color.
 */
export function getAggregateColor(aggregate: string, allAggregates: string[]): string {
  return `var(--agg-color-${getAggregateColorIndex(aggregate, allAggregates)})`;
}

/**
 * Returns the CSS variable name for an aggregate's background color.
 */
export function getAggregateBg(aggregate: string, allAggregates: string[]): string {
  return `var(--agg-bg-${getAggregateColorIndex(aggregate, allAggregates)})`;
}
