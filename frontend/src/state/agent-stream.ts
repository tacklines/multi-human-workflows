/**
 * Agent stream service — manages WebSocket subscriptions for real-time
 * agent activity (tool invocations, process output, state transitions).
 *
 * Uses the existing session WebSocket connection and sends subscribe_agent /
 * unsubscribe_agent messages to filter which participant streams we receive.
 */

import { authStore } from './auth-state.js';

function getWsBase(): string {
  const env = (import.meta as any).env?.VITE_WS_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
const WS_BASE = getWsBase();

export interface ToolInvocationEvent {
  stream: 'tool';
  participant_id: string;
  data: {
    id: string;
    tool_name: string;
    is_error: boolean;
    duration_ms: number;
    created_at: string;
  };
}

export interface OutputLineEvent {
  stream: 'output';
  participant_id: string;
  data: {
    line: string;
    fd: 'stdout' | 'stderr';
    ts: string;
  };
}

export interface StateTransitionEvent {
  stream: 'state';
  participant_id: string;
  data: {
    from: string;
    to: string;
    ts: string;
  };
}

export type AgentStreamEvent = ToolInvocationEvent | OutputLineEvent | StateTransitionEvent;
export type AgentStreamListener = (event: AgentStreamEvent) => void;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_FACTOR = 2;

class AgentStreamService {
  private _socket: WebSocket | null = null;
  private _sessionCode: string | null = null;
  private _subscribedAgents = new Set<string>();
  private _listeners = new Set<AgentStreamListener>();
  private _backoffMs = INITIAL_BACKOFF_MS;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _intentionalClose = false;

  connect(sessionCode: string): void {
    if (this._sessionCode === sessionCode && this._socket?.readyState === WebSocket.OPEN) {
      return;
    }
    this.disconnect();
    this._intentionalClose = false;
    this._sessionCode = sessionCode;
    this._backoffMs = INITIAL_BACKOFF_MS;
    this._openSocket(sessionCode);
  }

  disconnect(): void {
    this._intentionalClose = true;
    this._sessionCode = null;
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._socket) {
      this._socket.close();
      this._socket = null;
    }
    this._subscribedAgents.clear();
  }

  subscribe(participantId: string): void {
    this._subscribedAgents.add(participantId);
    this._sendSubscribe(participantId);
  }

  unsubscribe(participantId: string): void {
    this._subscribedAgents.delete(participantId);
    this._sendUnsubscribe(participantId);
  }

  addListener(fn: AgentStreamListener): void {
    this._listeners.add(fn);
  }

  removeListener(fn: AgentStreamListener): void {
    this._listeners.delete(fn);
  }

  private _openSocket(code: string): void {
    const ws = new WebSocket(WS_BASE);
    this._socket = ws;

    ws.addEventListener('open', () => {
      this._backoffMs = INITIAL_BACKOFF_MS;
      const token = authStore.getAccessToken();
      ws.send(JSON.stringify({
        type: 'join',
        sessionCode: code,
        ...(token && { token }),
      }));
      // Re-subscribe to any agents we were tracking
      for (const pid of this._subscribedAgents) {
        this._sendSubscribe(pid);
      }
    });

    ws.addEventListener('message', (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'agent_stream') {
          const event: AgentStreamEvent = {
            stream: msg.stream,
            participant_id: msg.participant_id,
            data: msg.data,
          };
          for (const fn of this._listeners) {
            fn(event);
          }
        }
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener('close', () => {
      if (this._socket === ws) this._socket = null;
      if (!this._intentionalClose && this._sessionCode) {
        this._scheduleReconnect(this._sessionCode);
      }
    });

    ws.addEventListener('error', () => {});
  }

  private _sendSubscribe(participantId: string): void {
    if (this._socket?.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify({
        type: 'subscribe_agent',
        participantId,
      }));
    }
  }

  private _sendUnsubscribe(participantId: string): void {
    if (this._socket?.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify({
        type: 'unsubscribe_agent',
        participantId,
      }));
    }
  }

  private _scheduleReconnect(code: string): void {
    if (this._reconnectTimer !== null) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._intentionalClose && this._sessionCode === code) {
        this._backoffMs = Math.min(this._backoffMs * BACKOFF_FACTOR, MAX_BACKOFF_MS);
        this._openSocket(code);
      }
    }, this._backoffMs);
  }
}

export const agentStream = new AgentStreamService();
