"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/admin/suggestions",      label: "Suggestions",      countable: true },
  { href: "/admin/allowlist",        label: "Allowlist",        countable: false },
  { href: "/admin/card-map",         label: "Card Map",         countable: false },
  { href: "/admin/vendor-overrides", label: "Vendor Overrides", countable: false },
  { href: "/admin/audit",            label: "Audit log",        countable: false },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/suggestions/count")
      .then(r => r.json())
      .then(b => setCount(b.count ?? 0))
      .catch(() => setCount(null));
  }, [pathname]);

  return (
    <aside className="w-[200px] shrink-0 border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <div className="px-[18px] pb-[14px] pt-5 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Admin
      </div>
      <nav>
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center justify-between border-l-[3px] px-[18px] py-2 text-[13px] no-underline transition-colors " +
                (active
                  ? "border-blue-600 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-400"
                  : "border-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")
              }
            >
              <span>{item.label}</span>
              {item.countable && count !== null && count > 0 && (
                <span className="bg-blue-600 dark:bg-blue-500 text-white px-1.5 rounded-full text-[11px] font-semibold">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-gray-200 px-[18px] pt-3 dark:border-gray-700">
        <Link
          href="/"
          className="text-[12px] text-gray-500 no-underline dark:text-gray-400"
        >
          ← Dashboard
        </Link>
      </div>
    </aside>
  );
}
