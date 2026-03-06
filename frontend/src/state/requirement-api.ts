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

export type RequirementStatusType = 'draft' | 'active' | 'satisfied' | 'archived';
export type RequirementPriority = 'critical' | 'high' | 'medium' | 'low';

export interface RequirementListView {
  id: string;
  title: string;
  status: RequirementStatusType;
  priority: RequirementPriority;
  parent_id: string | null;
  child_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export interface RequirementDetailView extends RequirementListView {
  project_id: string;
  description: string;
  created_by: string;
  session_id: string | null;
  children: RequirementListView[];
  linked_task_ids: string[];
  task_done_count: number;
  task_total_count: number;
}

export async function fetchRequirements(
  projectId: string,
  filters?: { status?: RequirementStatusType; priority?: RequirementPriority; parent_id?: string },
): Promise<RequirementListView[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.parent_id) params.set('parent_id', filters.parent_id);
  const qs = params.toString();
  const url = `${API_BASE}/api/projects/${projectId}/requirements${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleResponse<RequirementListView[]>(res);
}

export async function fetchRequirement(projectId: string, reqId: string): Promise<RequirementDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requirements/${reqId}`, {
    headers: authHeaders(),
  });
  return handleResponse<RequirementDetailView>(res);
}

export async function createRequirement(
  projectId: string,
  data: { title: string; description?: string; priority?: string; parent_id?: string },
): Promise<RequirementDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<RequirementDetailView>(res);
}

export async function updateRequirement(
  projectId: string,
  reqId: string,
  data: { title?: string; description?: string; status?: string; priority?: string; parent_id?: string },
): Promise<RequirementDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<RequirementDetailView>(res);
}

export type RequestStatusType = 'pending' | 'analyzing' | 'decomposed' | 'archived';

export interface RequestListView {
  id: string;
  title: string;
  status: RequestStatusType;
  author_id: string;
  requirement_count: number;
  created_at: string;
  updated_at: string;
}

export interface RequestDetailView extends RequestListView {
  project_id: string;
  session_id: string | null;
  body: string;
  analysis: string | null;
  linked_requirement_ids: string[];
  requirement_satisfied_count: number;
  requirement_total_count: number;
}

export async function fetchRequests(
  projectId: string,
  filters?: { status?: RequestStatusType },
): Promise<RequestListView[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const url = `${API_BASE}/api/projects/${projectId}/requests${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleResponse<RequestListView[]>(res);
}

export async function fetchRequest(projectId: string, requestId: string): Promise<RequestDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requests/${requestId}`, {
    headers: authHeaders(),
  });
  return handleResponse<RequestDetailView>(res);
}

export async function createRequest(
  projectId: string,
  data: { title: string; body: string; session_id?: string },
): Promise<RequestDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requests`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<RequestDetailView>(res);
}

export async function updateRequest(
  projectId: string,
  requestId: string,
  data: { title?: string; body?: string; status?: string; analysis?: string },
): Promise<RequestDetailView> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requests/${requestId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<RequestDetailView>(res);
}

export async function linkRequestRequirement(
  projectId: string,
  requestId: string,
  requirementId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/requests/${requestId}/requirements`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ requirement_id: requirementId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
