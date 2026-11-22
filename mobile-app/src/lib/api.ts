/** Typed client for the backend in /backend. */
import { getConfig, isConfigured } from './config';

export type Email = {
  account: string;
  id: string;
  thread_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  date: string | null;
  unread: boolean;
  important: boolean;
};

export type EmailDetail = Email & { to: string; cc: string; body: string; web_url: string };

export type CalendarEvent = {
  account: string;
  calendar_id: string;
  id: string;
  title: string;
  start: string; // ISO with offset
  end: string;
  date: string; // local YYYY-MM-DD the event starts on
  all_day: boolean;
  location: string;
  description: string;
  web_url: string;
};

export type CanvasItem = {
  id: string;
  type: string; // assignment | quiz | discussion_topic | announcement | calendar_event | ...
  title: string;
  course: string;
  due_at: string | null;
  points_possible: number | null;
  submitted: boolean;
  graded: boolean;
  missing: boolean;
  late: boolean;
  done: boolean;
  new_activity: boolean;
  web_url: string;
};

export type Errors = Record<string, string>;

export type Dashboard = {
  generated_at: string;
  timezone: string;
  emails: Email[];
  events: CalendarEvent[];
  canvas: CanvasItem[];
  errors: Errors;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const cfg = await getConfig();
  if (!isConfigured(cfg)) throw new ApiError('Set the server URL and token in Settings.', 0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(cfg.serverUrl + path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.apiToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(aborted ? 'The server took too long to answer.' : 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch {
      // non-JSON error body
    }
    if (res.status === 401) detail = 'The server rejected the API token. Check Settings.';
    throw new ApiError(detail || `Server error (${res.status}).`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health', {}, 15000),
  dashboard: () => request<Dashboard>('/api/dashboard'),
  emails: (limit = 30) => request<{ items: Email[]; errors: Errors }>(`/api/emails?limit=${limit}`),
  email: (account: string, id: string) =>
    request<EmailDetail>(`/api/emails/${encodeURIComponent(account)}/${encodeURIComponent(id)}`),
  calendar: (start: string, end: string) =>
    request<{ items: CalendarEvent[]; errors: Errors }>(
      `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    ),
  canvas: (daysBack = 7, daysAhead = 30) =>
    request<{ items: CanvasItem[]; errors: Errors }>(`/api/canvas?days_back=${daysBack}&days_ahead=${daysAhead}`),
  chat: (messages: ChatTurn[]) =>
    request<{ reply: string }>('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) }, 90000),
};

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
