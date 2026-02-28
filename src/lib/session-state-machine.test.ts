import { describe, it, expect } from 'vitest';
import { canTransition, transitionSession } from './session-state-machine.js';

describe('canTransition', () => {
  describe('Given an active session', () => {
    it('returns true for pause', () => {
      expect(canTransition('active', 'pause')).toBe(true);
    });

    it('returns true for close', () => {
      expect(canTransition('active', 'close')).toBe(true);
    });

    it('returns false for resume', () => {
      expect(canTransition('active', 'resume')).toBe(false);
    });
  });

  describe('Given a paused session', () => {
    it('returns true for resume', () => {
      expect(canTransition('paused', 'resume')).toBe(true);
    });

    it('returns true for close', () => {
      expect(canTransition('paused', 'close')).toBe(true);
    });

    it('returns false for pause', () => {
      expect(canTransition('paused', 'pause')).toBe(false);
    });
  });

  describe('Given a closed session', () => {
    it('returns false for pause', () => {
      expect(canTransition('closed', 'pause')).toBe(false);
    });

    it('returns false for resume', () => {
      expect(canTransition('closed', 'resume')).toBe(false);
    });

    it('returns false for close', () => {
      expect(canTransition('closed', 'close')).toBe(false);
    });
  });
});

describe('transitionSession', () => {
  describe('Valid transitions', () => {
    it('transitions active -> paused on pause', () => {
      expect(transitionSession('active', 'pause')).toBe('paused');
    });

    it('transitions active -> closed on close', () => {
      expect(transitionSession('active', 'close')).toBe('closed');
    });

    it('transitions paused -> active on resume', () => {
      expect(transitionSession('paused', 'resume')).toBe('active');
    });

    it('transitions paused -> closed on close', () => {
      expect(transitionSession('paused', 'close')).toBe('closed');
    });
  });

  describe('Invalid transitions throw descriptive errors', () => {
    it('throws when resuming an active session', () => {
      expect(() => transitionSession('active', 'resume')).toThrow(
        "Invalid session transition: cannot 'resume' a session that is 'active'"
      );
    });

    it('throws when pausing a paused session', () => {
      expect(() => transitionSession('paused', 'pause')).toThrow(
        "Invalid session transition: cannot 'pause' a session that is 'paused'"
      );
    });

    it('throws when pausing a closed session', () => {
      expect(() => transitionSession('closed', 'pause')).toThrow(
        "Invalid session transition: cannot 'pause' a session that is 'closed'"
      );
    });

    it('throws when resuming a closed session', () => {
      expect(() => transitionSession('closed', 'resume')).toThrow(
        "Invalid session transition: cannot 'resume' a session that is 'closed'"
      );
    });

    it('throws when closing a closed session', () => {
      expect(() => transitionSession('closed', 'close')).toThrow(
        "Invalid session transition: cannot 'close' a session that is 'closed'"
      );
    });
  });
});
