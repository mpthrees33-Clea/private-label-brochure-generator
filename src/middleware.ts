// V1 demo: NextAuth middleware disabled. Login is gated by the
// shared password but the auth flow only works once the user sets
// NEXTAUTH_URL on Vercel. Re-enable by matching real routes here
// after NEXTAUTH_URL is configured.
export function middleware() {
  return;
}

export const config = { matcher: [] };
