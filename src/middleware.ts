export { default } from "next-auth/middleware";

// Negative-match pattern: everything EXCEPT these paths gets auth-gated.
// Add anything that must be reachable without a session.
export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon\\.ico|brand|sample|internal/brochure).*)",
  ],
};
