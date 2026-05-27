import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16 requires a NAMED 'proxy' function export.
// Destructure-rename (`export const { auth: proxy } = ...`) isn't statically
// detected by Next.js — assign first, then export the named const.
const { auth } = NextAuth(authConfig);
export const proxy = auth;

export const config = {
  matcher: ["/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico).*)"],
};
