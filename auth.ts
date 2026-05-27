import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Google OAuth provider configured as type:"oauth" (NOT "oidc") to skip
// Auth.js v5's strict RFC9207 iss-parameter validation. Behind Vercel's edge,
// Google's iss query param doesn't reliably reach the callback handler,
// causing CallbackRouteError. Using OAuth mode preserves the same scopes,
// token exchange, and userinfo flow without the OIDC-only iss check.
const googleProvider = {
  id: "google",
  name: "Google",
  type: "oauth" as const,
  issuer: "https://accounts.google.com",
  authorization: {
    url: "https://accounts.google.com/o/oauth2/v2/auth",
    params: { scope: "openid email profile" },
  },
  token: "https://oauth2.googleapis.com/token",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  profile(profile: { sub: string; name: string; email: string; picture: string }) {
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      image: profile.picture,
    };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [googleProvider],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile }) {
      const email = profile?.email ?? "";
      return email.endsWith("@example.com");
    },
  },
});
