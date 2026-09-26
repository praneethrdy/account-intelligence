import type {
  AccountListResponse,
  ActivityCreate,
  AnalyzeResponse,
  Intelligence,
  NextAction,
  PriorityFilter,
  SortKey,
  TimelineResponse,
} from '../types';

/** Error with an HTTP status so pages can show a friendly 404 vs a generic failure. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// In development Vite proxies /api to FastAPI. In production set
// VITE_API_BASE_URL to the backend origin (e.g. https://my-api.onrender.com).
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' }, ...init });
  } catch {
    throw new ApiError('Cannot reach the API server. If it was idle it may be waking up; try again in a few seconds.', 0);
  }
  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export interface Health {
  status: string;
  aiConfigured: boolean;
  model: string;
}

// Session cache for hover previews; cleared whenever data changes.
const intelCache = new Map<number, Promise<Intelligence>>();

export const api = {
  health: () => request<Health>('/api/health'),
  intelligenceCached: (id: number) => {
    let p = intelCache.get(id);
    if (!p) {
      p = request<Intelligence>(`/api/accounts/${id}/intelligence`);
      p.catch(() => intelCache.delete(id));
      intelCache.set(id, p);
    }
    return p;
  },
  createActivity: async (id: number, body: ActivityCreate) => {
    const res = await request<{ id: number }>(`/api/accounts/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    intelCache.clear();
    return res;
  },
  listAccounts: (priority: PriorityFilter, sort: SortKey) =>
    request<AccountListResponse>(`/api/accounts?priority=${priority}&sort=${sort}&order=desc`),
  intelligence: (id: number) => request<Intelligence>(`/api/accounts/${id}/intelligence`),
  timeline: (id: number) => request<TimelineResponse>(`/api/accounts/${id}/timeline`),
  nextAction: (id: number) => request<NextAction>(`/api/accounts/${id}/next-action`, { method: 'POST' }),
  analyze: (id: number) => request<AnalyzeResponse>(`/api/accounts/${id}/analyze`, { method: 'POST' }),
};
