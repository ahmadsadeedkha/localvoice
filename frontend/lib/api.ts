import "server-only";
import { auth } from "@clerk/nextjs/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    path: string,
    /** The backend's own message for this failure, when it sent one. */
    public readonly detail?: string,
  ) {
    super(detail ?? `API ${status} on ${path}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const json = await res.json();
      detail = Array.isArray(json.message) ? json.message[0] : json.message;
    } catch {
      // Non-JSON error body: fall back to the generic message.
    }
    throw new ApiError(res.status, path, detail);
  }
  return res.json() as Promise<T>;
}

export const apiFetch = <T>(path: string) => request<T>("GET", path);

export const apiMutate = <T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => request<T>(method, path, body);
