import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const PUBLIC = ["/sign-in", "/sign-up", "/design"];

const matches = (path: string, bases: string[]) =>
  bases.some((b) => path === b || path.startsWith(`${b}/`));

// Convenience redirects only. The real access checks live in the layouts
// and in the backend guard, so a gap here can't expose data.
export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;
  if (matches(path, PUBLIC)) return;

  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

  if (!orgId && !matches(path, ["/onboarding"])) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
