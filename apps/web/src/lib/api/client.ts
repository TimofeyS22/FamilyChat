import { ApiError } from "@/lib/api/errors";
import { familyApiBaseUrl } from "@/lib/config/env";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export async function apiRequest<TResponse>(
  path: string,
  { body, method = "GET" }: RequestOptions = {},
): Promise<TResponse> {
  const response = await fetch(`${familyApiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError("Request failed", response.status);
  }

  return payload as TResponse;
}
