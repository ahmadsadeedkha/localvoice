"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const REASONS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  missing_scopes:
    "Some permissions were unticked. Connect again and allow all calendar permissions.",
  invalid_state: "The connection link expired. Please try again.",
  no_refresh_token: "Google didn't grant offline access. Please try again.",
  forbidden: "Only owners and admins can connect Google Calendar.",
};

/** Shows the result of the Google redirect once, then cleans ?google=... out of the URL. */
export function GoogleCallbackToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    const result = params.get("google");
    if (!result || shown.current) return;
    shown.current = true;

    if (result === "connected") {
      toast.success("Google Calendar connected");
    } else {
      const reason = params.get("reason") ?? "";
      toast.error(
        REASONS[reason] ??
          "Couldn't connect Google Calendar. Please try again.",
      );
    }
    router.replace(pathname, { scroll: false });
  }, [params, router, pathname]);

  return null;
}
