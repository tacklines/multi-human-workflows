import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordActivity,
  getRecentActivity,
  onActivity,
  _reset,
} from './activity-pulse.js';

beforeEach(() => {
  _reset();
  vi.useRealTimers();
});

describe('recordActivity', () => {
  it('stores activity for a participant', () => {
    recordActivity('alice');
    expect(getRecentActivity('alice')).toBe(true);
  });

  it('does not record activity for other participants', () => {
    recordActivity('alice');
    expect(getRecentActivity('bob')).toBe(false);
  });

  it('updates timestamp on repeated calls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    recordActivity('alice');
    vi.setSystemTime(1500);
    recordActivity('alice');
    // At t=1500 with a 2000ms window, should still be recent
    expect(getRecentActivity('alice', 2000)).toBe(true);
  });
});

describe('getRecentActivity', () => {
  it('returns false for unknown participant', () => {
    expect(getRecentActivity('unknown')).toBe(false);
  });

  it('returns true within default window', () => {
    recordActivity('alice');
    expect(getRecentActivity('alice')).toBe(true);
  });

  it('returns true within custom window', () => {
    recordActivity('alice');
    expect(getRecentActivity('alice', 5000)).toBe(true);
  });

  it('returns false after window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    recordActivity('alice');
    vi.setSystemTime(1000 + 2001);
    expect(getRecentActivity('alice', 2000)).toBe(false);
  });

  it('returns true exactly at window boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    recordActivity('alice');
    vi.setSystemTime(1000 + 2000);
    expect(getRecentActivity('alice', 2000)).toBe(true);
  });
});

describe('onActivity', () => {
  it('notifies subscriber when activity is recorded', () => {
    const received: string[] = [];
    onActivity((id) => received.push(id));
    recordActivity('alice');
    expect(received).toEqual(['alice']);
  });

  it('notifies multiple subscribers', () => {
    const a: string[] = [];
    const b: string[] = [];
    onActivity((id) => a.push(id));
    onActivity((id) => b.push(id));
    recordActivity('alice');
    expect(a).toEqual(['alice']);
    expect(b).toEqual(['alice']);
  });

  it('returns an unsubscribe function', () => {
    const received: string[] = [];
    const unsub = onActivity((id) => received.push(id));
    recordActivity('alice');
    unsub();
    recordActivity('bob');
    // Only 'alice' was recorded before unsubscribe
    expect(received).toEqual(['alice']);
  });

  it('does not notify after unsubscribe', () => {
    const received: string[] = [];
    const unsub = onActivity((id) => received.push(id));
    unsub();
    recordActivity('alice');
    expect(received).toHaveLength(0);
  });

  it('calling unsubscribe twice is safe (no error)', () => {
    const unsub = onActivity(() => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});
