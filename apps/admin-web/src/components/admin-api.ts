export class SessionExpiredError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) throw new SessionExpiredError("Sessão expirada.");
  const data = await response.json();
  if (!response.ok) {
    const issue = Array.isArray(data.issues) ? data.issues[0]?.message : null;
    throw new Error(issue ?? data.message ?? "Não foi possível concluir a operação.");
  }
  return data as T;
}
