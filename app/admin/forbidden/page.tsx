import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Admin only</h1>
      <p className="max-w-[480px] text-center text-gray-500 dark:text-gray-400">
        Your account isn&apos;t in the admin allowlist (<code className="rounded bg-gray-100 px-1 dark:bg-gray-700">ADMIN_EMAILS</code>). If you need access,
        contact your IT administrator.
      </p>
      <Link href="/" className="text-blue-600 underline dark:text-blue-400">
        ← Back to dashboard
      </Link>
    </div>
  );
}
