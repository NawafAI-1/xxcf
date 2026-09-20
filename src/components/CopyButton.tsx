'use client';

import { useEffect, useState } from 'react';

/** Copies a string to the clipboard and says so for a moment afterwards. */
export default function CopyButton({
  value,
  label = 'Copy',
  className = '',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard access can be refused (insecure context, denied
          // permission); the text is on the page either way, so stay quiet.
        }
      }}
      className={`rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 ${className}`}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
