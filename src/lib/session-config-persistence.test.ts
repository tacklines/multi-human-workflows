import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSessionConfig, saveSessionConfig } from './session-config-persistence.js';
import { DEFAULT_SESSION_CONFIG } from '../schema/types.js';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
}

let localStorageMock = makeLocalStorageMock();

beforeEach(() => {
  localStorageMock = makeLocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadSessionConfig', () => {
  it('returns DEFAULT_SESSION_CONFIG when nothing is stored', () => {
    const config = loadSessionConfig();
    expect(config).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('returns DEFAULT_SESSION_CONFIG for a given session code when nothing is stored', () => {
    const config = loadSessionConfig('ABC123');
    expect(config).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('reads and merges a partial stored config with defaults', () => {
    const partial = { comparison: { sensitivity: 'exact', autoDetectConflicts: false, suggestResolutions: true } };
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(partial));
    const config = loadSessionConfig();
    expect(config.comparison.sensitivity).toBe('exact');
    expect(config.comparison.autoDetectConflicts).toBe(false);
    // Other top-level keys should fall back to defaults
    expect(config.contracts).toEqual(DEFAULT_SESSION_CONFIG.contracts);
  });

  it('handles corrupted JSON gracefully by returning defaults', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-valid-json{{{');
    const config = loadSessionConfig();
    expect(config).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('handles localStorage.getItem throwing by returning defaults', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage error');
    });
    const config = loadSessionConfig();
    expect(config).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('uses generic key when no session code provided', () => {
    loadSessionConfig();
    expect(localStorageMock.getItem).toHaveBeenCalledWith('mhw-session-config');
  });

  it('uses session-code-specific key when session code provided', () => {
    loadSessionConfig('XYZ789');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('mhw-session-config-XYZ789');
  });
});

describe('saveSessionConfig', () => {
  it('writes config to localStorage', () => {
    saveSessionConfig({ ...DEFAULT_SESSION_CONFIG });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'mhw-session-config',
      expect.any(String)
    );
  });

  it('writes the correct config content to localStorage', () => {
    const config = { ...DEFAULT_SESSION_CONFIG };
    saveSessionConfig(config);
    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string);
    expect(stored.comparison).toEqual(DEFAULT_SESSION_CONFIG.comparison);
  });

  it('uses session-code-specific key when session code provided', () => {
    saveSessionConfig({ ...DEFAULT_SESSION_CONFIG }, 'ABC123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'mhw-session-config-ABC123',
      expect.any(String)
    );
  });

  it('uses generic key when no session code provided', () => {
    saveSessionConfig({ ...DEFAULT_SESSION_CONFIG });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'mhw-session-config',
      expect.any(String)
    );
  });

  it('does not throw when localStorage.setItem throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveSessionConfig({ ...DEFAULT_SESSION_CONFIG })).not.toThrow();
  });

  it('round-trips: saved config can be loaded back with the same session code', () => {
    const config = {
      ...DEFAULT_SESSION_CONFIG,
      comparison: { ...DEFAULT_SESSION_CONFIG.comparison, sensitivity: 'exact' as const },
    };
    saveSessionConfig(config, 'ROUND');
    // simulate what loadSessionConfig would do by using the stored value
    const stored = localStorageMock.setItem.mock.calls[0][1] as string;
    localStorageMock.getItem.mockReturnValueOnce(stored);
    const loaded = loadSessionConfig('ROUND');
    expect(loaded.comparison.sensitivity).toBe('exact');
  });
});
