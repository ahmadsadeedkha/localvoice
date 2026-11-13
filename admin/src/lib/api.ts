import { useCallback } from "react";
import { useAuth } from "@clerk/react";

const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Nest sends `{ message: string | string[] }`; fall back to the status code. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json();
    const m = Array.isArray(json.message) ? json.message[0] : json.message;
    if (typeof m === "string" && m) return m;
  } catch {
    // non-JSON body
  }
  return `API ${res.status}`;
}

export function useApi() {
  const { getToken } = useAuth();

  return useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
      return res.json() as Promise<T>;
    },
    [getToken],
  );
}
