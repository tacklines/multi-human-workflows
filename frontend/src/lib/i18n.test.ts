import { describe, it, expect, afterEach } from 'vitest';
import { t, setLocale, getLocale, isRtl } from './i18n.js';

describe('i18n', () => {
  afterEach(() => {
    // Reset to English after each test
    setLocale('en');
  });

  it('returns the English string for a known key', () => {
    expect(t('app.brand')).toBe('Seam');
  });

  it('returns the key itself when the key is missing', () => {
    expect(t('unknown.key')).toBe('unknown.key');
  });

  it('interpolates {{param}} placeholders', () => {
    expect(t('time.minutesAgo', { count: 5 })).toBe('5m ago');
  });

  it('reports isRtl() = false for English', () => {
    setLocale('en');
    expect(isRtl()).toBe(false);
  });

  it('reports isRtl() = true for Arabic', () => {
    setLocale('ar');
    expect(isRtl()).toBe(true);
  });

  it('getLocale() reflects the current locale', () => {
    setLocale('fr');
    expect(getLocale()).toBe('fr');
  });
});
