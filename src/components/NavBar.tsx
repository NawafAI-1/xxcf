'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/browse', label: 'Browse' },
  { href: '/map', label: 'Map' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/network', label: 'Network' },
];

export default function NavBar() {
  const pathname = usePathname() ?? '/';

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <span className="h-5 w-1.5 rounded-full bg-teal-600" aria-hidden />
          <span className="text-base font-semibold tracking-tight">Red Sea Marine Data Catalog</span>
        </Link>
        <ul className="flex flex-wrap gap-1 text-sm font-medium">
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 transition ${
                    active
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
