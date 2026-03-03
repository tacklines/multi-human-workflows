import { describe, it, expect, beforeEach } from 'vitest';
import { saveSessionIdentity, loadSessionIdentity, clearSessionIdentity } from './session-identity-persistence.js';

// Mock localStorage for Node/jsdom test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('session-identity-persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('loadSessionIdentity', () => {
    it('returns null when nothing is stored', () => {
      expect(loadSessionIdentity()).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      localStorageMock.setItem('seam-active-session', 'not-json');
      expect(loadSessionIdentity()).toBeNull();
    });

    it('returns null when stored object is missing required fields', () => {
      localStorageMock.setItem('seam-active-session', JSON.stringify({ code: 'ABC123' }));
      expect(loadSessionIdentity()).toBeNull();
    });

    it('returns null when stored object has wrong field types', () => {
      localStorageMock.setItem('seam-active-session', JSON.stringify({ code: 123, participantId: 'p1' }));
      expect(loadSessionIdentity()).toBeNull();
    });
  });

  describe('saveSessionIdentity + loadSessionIdentity round-trip', () => {
    it('persists and retrieves session identity', () => {
      saveSessionIdentity('ABC123', 'participant-1');
      const result = loadSessionIdentity();
      expect(result).toEqual({ code: 'ABC123', participantId: 'participant-1' });
    });

    it('overwrites previous stored session', () => {
      saveSessionIdentity('FIRST1', 'p1');
      saveSessionIdentity('SECOND', 'p2');
      const result = loadSessionIdentity();
      expect(result).toEqual({ code: 'SECOND', participantId: 'p2' });
    });
  });

  describe('clearSessionIdentity', () => {
    it('removes stored session so loadSessionIdentity returns null', () => {
      saveSessionIdentity('ABC123', 'p1');
      clearSessionIdentity();
      expect(loadSessionIdentity()).toBeNull();
    });

    it('is safe to call when nothing is stored', () => {
      expect(() => clearSessionIdentity()).not.toThrow();
    });
  });

  describe('error resilience', () => {
    it('saveSessionIdentity silently swallows localStorage errors', () => {
      const errorStorage = { ...localStorageMock, setItem: () => { throw new Error('quota exceeded'); } };
      Object.defineProperty(globalThis, 'localStorage', { value: errorStorage, writable: true });
      expect(() => saveSessionIdentity('ABC123', 'p1')).not.toThrow();
      Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
    });

    it('loadSessionIdentity silently swallows localStorage errors', () => {
      const errorStorage = { ...localStorageMock, getItem: () => { throw new Error('storage error'); } };
      Object.defineProperty(globalThis, 'localStorage', { value: errorStorage, writable: true });
      expect(loadSessionIdentity()).toBeNull();
      Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
    });

    it('clearSessionIdentity silently swallows localStorage errors', () => {
      const errorStorage = { ...localStorageMock, removeItem: () => { throw new Error('storage error'); } };
      Object.defineProperty(globalThis, 'localStorage', { value: errorStorage, writable: true });
      expect(() => clearSessionIdentity()).not.toThrow();
      Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
    });
  });
});
