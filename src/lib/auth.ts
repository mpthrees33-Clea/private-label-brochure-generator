import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const expected = process.env.SHARED_PASSWORD;
        if (!expected) throw new Error("SHARED_PASSWORD not configured");
        if (credentials?.password === expected) {
          return { id: "rep", name: "Trinity Rep" };
        }
        return null;
      },
    }),
  ],
};
