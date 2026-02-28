import { describe, it, expect } from 'vitest';
import { getAggregateColorIndex, getAggregateColor, getAggregateBg } from './aggregate-colors.js';

describe('getAggregateColorIndex', () => {
  it('returns stable indices regardless of input order', () => {
    const aggs1 = ['Billing', 'Account', 'Order'];
    const aggs2 = ['Order', 'Account', 'Billing'];

    expect(getAggregateColorIndex('Account', aggs1)).toBe(getAggregateColorIndex('Account', aggs2));
    expect(getAggregateColorIndex('Billing', aggs1)).toBe(getAggregateColorIndex('Billing', aggs2));
    expect(getAggregateColorIndex('Order', aggs1)).toBe(getAggregateColorIndex('Order', aggs2));
  });

  it('assigns indices based on alphabetical sort order', () => {
    const aggs = ['Zebra', 'Apple', 'Mango'];
    // Sorted: Apple, Mango, Zebra
    expect(getAggregateColorIndex('Apple', aggs)).toBe(0);
    expect(getAggregateColorIndex('Mango', aggs)).toBe(1);
    expect(getAggregateColorIndex('Zebra', aggs)).toBe(2);
  });

  it('wraps around after 8 aggregates', () => {
    const aggs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    expect(getAggregateColorIndex('A', aggs)).toBe(0);
    expect(getAggregateColorIndex('H', aggs)).toBe(7);
    expect(getAggregateColorIndex('I', aggs)).toBe(0); // wraps
    expect(getAggregateColorIndex('J', aggs)).toBe(1); // wraps
  });

  it('returns 0 for unknown aggregate', () => {
    const aggs = ['Account', 'Billing'];
    expect(getAggregateColorIndex('Unknown', aggs)).toBe(0);
  });
});

describe('getAggregateColor', () => {
  it('returns proper CSS var string', () => {
    const aggs = ['Billing', 'Account'];
    // Sorted: Account(0), Billing(1)
    expect(getAggregateColor('Account', aggs)).toBe('var(--agg-color-0)');
    expect(getAggregateColor('Billing', aggs)).toBe('var(--agg-color-1)');
  });
});

describe('getAggregateBg', () => {
  it('returns proper CSS bg var string', () => {
    const aggs = ['Billing', 'Account'];
    expect(getAggregateBg('Account', aggs)).toBe('var(--agg-bg-0)');
    expect(getAggregateBg('Billing', aggs)).toBe('var(--agg-bg-1)');
  });
});
