import type { NextAuthConfig } from "next-auth";
// parseAdminEmails is a pure function with no imports — safe for edge runtime (proxy.ts).
// lib/admin-auth.ts uses the same helper to keep both gates in sync.
import { parseAdminEmails } from "@/lib/admin-emails";

function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email);
}

export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;
      if (pathname.startsWith("/login")) return true;
      if (!isLoggedIn) return false;

      const needsAdmin =
        (pathname.startsWith("/admin") && !pathname.startsWith("/admin/forbidden")) ||
        pathname.startsWith("/api/admin");

      if (needsAdmin && !isAdmin(auth!.user?.email)) {
        return Response.redirect(new URL("/admin/forbidden", request.url));
      }
      return true;
    },
  },
};
