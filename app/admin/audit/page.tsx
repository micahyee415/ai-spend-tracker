import { AuditFeed } from "@/components/admin/AuditFeed";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Audit log</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Every classifications write. Click &quot;View diff&quot; to see before/after.
      </p>
      <AuditFeed />
    </>
  );
}
