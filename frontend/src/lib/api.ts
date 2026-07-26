const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractErrorMessage(body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === "string" ? item : (item as { msg?: string })?.msg
      )
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) {
      return messages.join(", ");
    }
  }

  return "Request failed";
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, extractErrorMessage(body));
  }

  if (response.status === 204) {
    return null as T;
  }
  return response.json();
}

export type User = {
  id: number;
  email: string;
  created_at: string;
};

export type Token = {
  access_token: string;
  token_type: string;
};

export type Habit = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  current_streak: number;
  week_completed_count: number;
  week_goal: number;
};

export type WeeklyStats = {
  start_date: string;
  end_date: string;
  daily_completions: { date: string; completed_count: number }[];
  total_completions: number;
  completion_rate: number;
};

export const api = {
  register: (email: string, password: string) =>
    apiFetch<Token>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch<Token>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => apiFetch<User>("/auth/me", {}, token),

  listHabits: (token: string) => apiFetch<Habit[]>("/habits", {}, token),

  createHabit: (token: string, name: string, description?: string) =>
    apiFetch<Habit>(
      "/habits",
      { method: "POST", body: JSON.stringify({ name, description }) },
      token
    ),

  updateHabit: (
    token: string,
    id: number,
    payload: { name?: string; description?: string }
  ) =>
    apiFetch<Habit>(
      `/habits/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteHabit: (token: string, id: number) =>
    apiFetch<null>(`/habits/${id}`, { method: "DELETE" }, token),

  toggleComplete: (token: string, id: number) =>
    apiFetch<Habit>(`/habits/${id}/complete`, { method: "POST" }, token),

  weeklyStats: (token: string) => apiFetch<WeeklyStats>("/stats/weekly", {}, token),
};
