'use client';

import { useLocation } from '@tanstack/react-router';

import { NAV } from '@/lib/nav';

export function CurrentPage() {
  const { pathname } = useLocation();
  const current = NAV.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );

  if (!current) return null;

  return (
    <span className="hidden text-sm text-muted-foreground sm:inline">
      <span aria-hidden className="mx-2 text-muted-foreground/40">/</span>
      {current.label}
    </span>
  );
}
