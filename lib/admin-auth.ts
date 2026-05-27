// lib/admin-auth.ts
// Plain English: Defense-in-depth helper. Called inside every /api/admin/* route
// handler to assert the session belongs to an admin email — even if the proxy
// matcher somehow lets a non-admin through.

import { auth } from "@/auth";
import { parseAdminEmails } from "@/lib/admin-emails";

export class ForbiddenError extends Error {
  constructor(msg = "Admin only") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

export async function requireAdmin(): Promise<{ email: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new ForbiddenError("Not signed in");
  if (!parseAdminEmails().includes(email)) {
    console.warn(`admin gate rejected non-admin: ${email}`);
    throw new ForbiddenError("Admin only");
  }
  return { email };
}

export function adminErrorResponse(err: unknown): Response {
  if (err instanceof ForbiddenError) {
    return Response.json(
      { ok: false, error: { code: "FORBIDDEN", message: err.message } },
      { status: 403 }
    );
  }
  console.error("admin handler error", err);
  return Response.json(
    { ok: false, error: { code: "INTERNAL", message: "Unexpected error" } },
    { status: 500 }
  );
}
