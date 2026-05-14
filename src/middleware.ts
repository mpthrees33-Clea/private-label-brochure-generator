export { default } from "next-auth/middleware";

// Negative-match pattern: everything EXCEPT these paths gets auth-gated.
// All /api/* routes are excluded — they handle their own auth checks
// (or are public, like /api/brochure/pdf which renders a public preview).
export const config = {
  matcher: [
    "/((?!api|login|_next/static|_next/image|favicon\\.ico|brand|sample|internal/brochure).*)",
  ],
};
