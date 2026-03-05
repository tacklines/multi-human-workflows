import { authStore } from './auth-state.js';

const API_BASE = '';

function authHeaders(): Record<string, string> {
  const token = authStore.getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export type PlanStatusType = 'draft' | 'review' | 'accepted' | 'superseded' | 'abandoned';

export interface PlanListView {
  id: string;
  title: string;
  slug: string;
  status: PlanStatusType;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface PlanDetailView extends PlanListView {
  project_id: string;
  body: string;
  parent_id: string | null;
}

export async function fetchPlans(
  projectId: string,
  filters?: { status?: PlanStatusType },
): Promise<PlanListView[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const url = `${API_BASE}/api/projects/${projectId}/plans${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleResponse<PlanListView[]>(res);
}

export async function fetchPlan(projectId: string, planId: string): Promise<PlanDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/plans/${planId}`, {
    headers: authHeaders(),
  });
  return handleResponse<PlanDetailView>(res);
}

export async function createPlan(
  projectId: string,
  data: { title: string; slug?: string; body?: string },
): Promise<PlanDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/plans`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<PlanDetailView>(res);
}

export async function updatePlan(
  projectId: string,
  planId: string,
  data: { title?: string; body?: string; status?: string },
): Promise<PlanDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/plans/${planId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<PlanDetailView>(res);
}
