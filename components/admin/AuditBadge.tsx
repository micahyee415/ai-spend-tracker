export function AuditBadge({
  actor,
  when,
}: {
  actor: string | null;
  when: string | null;
}) {
  if (!when) return null;
  const displayActor = actor ? actor.split("@")[0] : null;
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400">
      {displayActor && <>{displayActor} • </>}
      {new Date(when).toLocaleDateString()}
    </span>
  );
}
