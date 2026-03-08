import { authStore } from "./auth-state.js";

const API_BASE = "";

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface PerspectiveMetric {
  perspective: string;
  count: number;
  success_count: number;
  failure_count: number;
  avg_duration_seconds: number | null;
}

export interface ModelMetric {
  model: string;
  count: number;
  cost_usd: number;
}

export interface MetricsSummary {
  invocation_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_duration_seconds: number | null;
  p50_duration_seconds: number | null;
  p95_duration_seconds: number | null;
  pending_count: number;
  by_perspective: PerspectiveMetric[];
  by_model: ModelMetric[];
  workspace_status: Record<string, number>;
  period: string;
}

export interface TimelineBucket {
  timestamp: string;
  completed: number;
  failed: number;
  pending: number;
}

export interface InvocationTimeline {
  buckets: TimelineBucket[];
  bucket_size: string;
  period: string;
}

export async function fetchMetricsSummary(
  projectId: string,
  period = "24h",
): Promise<MetricsSummary> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/metrics/summary?period=${period}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}

export async function fetchInvocationTimeline(
  projectId: string,
  period = "24h",
): Promise<InvocationTimeline> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/metrics/invocation-timeline?period=${period}`,
    { headers: authHeaders() },
  );
  return handleResponse(res);
}
