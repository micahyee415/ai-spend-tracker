"use client";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
      <h1 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-gray-100">AI Spend Dashboard</h1>
      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="rounded bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700"
      >
        Sign in with Google
      </button>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">@example.com accounts only</p>
    </main>
  );
}
