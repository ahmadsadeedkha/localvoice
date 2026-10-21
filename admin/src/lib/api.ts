import { useCallback } from "react";
import { useAuth } from "@clerk/react";

const API_URL = import.meta.env.VITE_API_URL as string;

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
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json() as Promise<T>;
    },
    [getToken],
  );
}
