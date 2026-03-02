import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShortcutRegistry } from './shortcut-registry.js';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    _store: store,
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
// Helpers — plain objects implementing the KeyboardEvent subset the registry needs
// ---------------------------------------------------------------------------

function makeEvent(
  key: string,
  opts: Partial<{
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }> = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    target: null,
    ...opts,
  } as unknown as KeyboardEvent;
}

function makeEventWithTarget(
  key: string,
  target: { tagName?: string; isContentEditable?: boolean },
): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    target,
  } as unknown as KeyboardEvent;
}

describe('ShortcutRegistry', () => {
  let reg: ShortcutRegistry;

  beforeEach(() => {
    reg = new ShortcutRegistry();
  });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  describe('Given a fresh registry', () => {
    it('starts with no shortcuts', () => {
      expect(reg.getAll()).toHaveLength(0);
    });

    it('registers a shortcut and makes it retrievable', () => {
      reg.register({ id: 'action.test', key: 't', description: 'Test', category: 'Actions' }, vi.fn());
      expect(reg.getAll()).toHaveLength(1);
      expect(reg.getAll()[0].id).toBe('action.test');
    });

    it('replacing an existing id updates the shortcut', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      reg.register({ id: 'action.test', key: 't', description: 'Test v1', category: 'Actions' }, handler1);
      reg.register({ id: 'action.test', key: 'u', description: 'Test v2', category: 'Actions' }, handler2);
      expect(reg.getAll()).toHaveLength(1);
      expect(reg.getAll()[0].key).toBe('u');
    });
  });

  describe('Given a registered shortcut', () => {
    it('unregistering removes it', () => {
      reg.register({ id: 'action.test', key: 't', description: 'Test', category: 'Actions' }, vi.fn());
      reg.unregister('action.test');
      expect(reg.getAll()).toHaveLength(0);
    });

    it('unregistering a non-existent id is a no-op', () => {
      expect(() => reg.unregister('action.missing')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Category filtering
  // ---------------------------------------------------------------------------

  describe('getByCategory', () => {
    it('returns only shortcuts in the specified category', () => {
      reg.register({ id: 'nav.1', key: '1', description: 'Nav 1', category: 'Navigation' }, vi.fn());
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, vi.fn());
      reg.register({ id: 'nav.2', key: '2', description: 'Nav 2', category: 'Navigation' }, vi.fn());

      const nav = reg.getByCategory('Navigation');
      expect(nav).toHaveLength(2);
      expect(nav.every((s) => s.category === 'Navigation')).toBe(true);
    });

    it('returns empty array for unknown category', () => {
      expect(reg.getByCategory('Unknown')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Key matching — simple key
  // ---------------------------------------------------------------------------

  describe('handleKeydown — simple key', () => {
    it('calls the handler when the key matches', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const handled = reg.handleKeydown(makeEvent('r'));

      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns false when no shortcut matches', () => {
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, vi.fn());

      expect(reg.handleKeydown(makeEvent('x'))).toBe(false);
    });

    it('is case-insensitive for single character keys', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      expect(reg.handleKeydown(makeEvent('R'))).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // Key matching — modifiers
  // ---------------------------------------------------------------------------

  describe('handleKeydown — modifier keys', () => {
    it('matches ctrl+shift combination', () => {
      const handler = vi.fn();
      reg.register(
        { id: 'phase.spark', key: '1', ctrl: true, shift: true, description: 'Spark', category: 'Phases' },
        handler,
      );

      const event = makeEvent('1', { ctrlKey: true, shiftKey: true });
      expect(reg.handleKeydown(event)).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not match when modifier is missing', () => {
      const handler = vi.fn();
      reg.register(
        { id: 'phase.spark', key: '1', ctrl: true, shift: true, description: 'Spark', category: 'Phases' },
        handler,
      );

      const event = makeEvent('1', { ctrlKey: true });
      expect(reg.handleKeydown(event)).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not match when extra modifier is present', () => {
      const handler = vi.fn();
      // Registered without ctrl
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEvent('r', { ctrlKey: true });
      expect(reg.handleKeydown(event)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Key matching — special keys
  // ---------------------------------------------------------------------------

  describe('handleKeydown — special keys', () => {
    it('matches Escape', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.escape', key: 'Escape', description: 'Cancel', category: 'Actions' }, handler);

      expect(reg.handleKeydown(makeEvent('Escape'))).toBe(true);
    });

    it('matches Enter', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.confirm', key: 'Enter', description: 'Confirm', category: 'Actions' }, handler);

      expect(reg.handleKeydown(makeEvent('Enter'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Editable target suppression
  // ---------------------------------------------------------------------------

  describe('handleKeydown — editable target suppression', () => {
    it('skips when target is an input element', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEventWithTarget('r', { tagName: 'INPUT' });

      expect(reg.handleKeydown(event)).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('skips when target is a textarea', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEventWithTarget('r', { tagName: 'TEXTAREA' });

      expect(reg.handleKeydown(event)).toBe(false);
    });

    it('skips when target is a select element', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEventWithTarget('r', { tagName: 'SELECT' });

      expect(reg.handleKeydown(event)).toBe(false);
    });

    it('skips when target is contenteditable', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEventWithTarget('r', { tagName: 'DIV', isContentEditable: true });

      expect(reg.handleKeydown(event)).toBe(false);
    });

    it('processes shortcut when target is a non-editable element', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEventWithTarget('r', { tagName: 'DIV', isContentEditable: false });

      expect(reg.handleKeydown(event)).toBe(true);
    });

    it('processes shortcut when target is null', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      const event = makeEvent('r');

      expect(reg.handleKeydown(event)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Customization
  // ---------------------------------------------------------------------------

  describe('customize', () => {
    it('changes the effective key for a registered shortcut', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      reg.customize('action.r', { key: 'x' });

      expect(reg.handleKeydown(makeEvent('x'))).toBe(true);
    });

    it('old key no longer triggers after customization', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      reg.customize('action.r', { key: 'x' });

      expect(reg.handleKeydown(makeEvent('r'))).toBe(false);
    });

    it('is a no-op for unknown shortcut id', () => {
      expect(() => reg.customize('action.missing', { key: 'z' })).not.toThrow();
    });

    it('reflects customized key in getAll()', () => {
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, vi.fn());
      reg.customize('action.r', { key: 'x' });

      const shortcuts = reg.getAll();
      expect(shortcuts[0].key).toBe('x');
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  describe('saveToStorage / loadFromStorage', () => {
    it('persists customizations to localStorage after customize()', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);
      reg.customize('action.r', { key: 'x' });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'mhw-keyboard-shortcuts',
        expect.stringContaining('"key":"x"'),
      );
    });

    it('removes storage key when no customizations remain after resetDefaults()', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);
      reg.customize('action.r', { key: 'x' });

      // Simulate storage with the customization present
      localStorageMock._store['mhw-keyboard-shortcuts'] = JSON.stringify({ 'action.r': { key: 'x' } });

      reg.resetDefaults();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('mhw-keyboard-shortcuts');
    });

    it('applies loaded customizations to already-registered shortcuts', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      // Seed storage after registration
      localStorageMock._store['mhw-keyboard-shortcuts'] = JSON.stringify({ 'action.r': { key: 'z' } });
      reg.loadFromStorage();

      expect(reg.handleKeydown(makeEvent('z'))).toBe(true);
    });

    it('applies customizations at register time if loadFromStorage was called first', () => {
      // Pre-seed localStorage
      localStorageMock._store['mhw-keyboard-shortcuts'] = JSON.stringify({ 'action.r': { key: 'z' } });

      // Load before registering (cold-start scenario)
      reg.loadFromStorage();
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      expect(reg.handleKeydown(makeEvent('z'))).toBe(true);
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorageMock._store['mhw-keyboard-shortcuts'] = '{invalid json}';
      expect(() => reg.loadFromStorage()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Reset to defaults
  // ---------------------------------------------------------------------------

  describe('resetDefaults', () => {
    it('clears all customizations so re-registration uses original keys', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);
      reg.customize('action.r', { key: 'x' });

      reg.resetDefaults();

      // After reset + re-register, original key should work
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);
      expect(reg.handleKeydown(makeEvent('r'))).toBe(true);
    });

    it('customized key no longer works after reset + re-register', () => {
      const handler = vi.fn();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);
      reg.customize('action.r', { key: 'x' });

      reg.resetDefaults();
      reg.register({ id: 'action.r', key: 'r', description: 'Resolve', category: 'Actions' }, handler);

      expect(reg.handleKeydown(makeEvent('x'))).toBe(false);
    });
  });
});
