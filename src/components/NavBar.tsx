'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS } from '@/lib/sections';

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
          <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-sky-500 to-teal-700" aria-hidden />
          <span className="text-base font-semibold tracking-tight">Red Sea Marine Data Catalog</span>
        </Link>
        <ul className="flex flex-wrap gap-1 text-sm font-medium">
          {SECTIONS.map((link) => {
            const active = isActive(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 transition ${
                    active ? '' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  // The active section is tinted with its own colour rather than
                  // one shared highlight, so the palette says where you are.
                  style={active ? { color: link.accent, backgroundColor: `${link.accent}14` } : undefined}
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
