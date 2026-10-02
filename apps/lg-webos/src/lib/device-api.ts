const DEFAULT_API_URL = import.meta.env?.VITE_API_URL ?? "http://localhost:4100";

type ApiErrorBody = {
  message?: unknown;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isAuthenticationFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export async function request<T>(
  path: string,
  init?: RequestInit,
  token?: string,
  baseUrl = DEFAULT_API_URL,
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let timedOut = false;
  const abortRequest = () => controller.abort();
  if (externalSignal?.aborted) abortRequest();
  else externalSignal?.addEventListener("abort", abortRequest, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    const responseText = await response.text();
    let data: unknown = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const body = data as ApiErrorBody | null;
      const message = typeof body?.message === "string"
        ? body.message
        : `Não foi possível concluir a operação (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new ApiError("O serviço demorou para responder. Tente novamente.", 408);
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortRequest);
  }
}
