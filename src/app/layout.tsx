import type { Metadata } from 'next';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Red Sea Marine Data Catalog',
  description:
    'An inventory of marine datasets covering the Red Sea basin — what exists, how ready it is to use, where it reaches, and where the gaps are.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="mt-10 border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Red Sea Marine Data Catalog — a catalog of KAUST Red Sea research data holdings.
              Records state their own known limitations; verify licences and DOIs before
              publication.
            </p>
            <p className="shrink-0">
              <Link href="/browse" className="font-medium text-teal-700 hover:text-teal-800">
                Browse datasets
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
