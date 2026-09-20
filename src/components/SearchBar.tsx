'use client';

import { useRef, useState } from 'react';
import { warmUpSearch, search } from '@/lib/search';

export default function SearchBar({
  onResults,
}: {
  onResults: (ids: string[] | null) => void;
}) {
  const [value, setValue] = useState('');
  const [loadingModel, setLoadingModel] = useState(false);
  const [searching, setSearching] = useState(false);
  const warmedUp = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(next: string) {
    setValue(next);

    if (!warmedUp.current) {
      warmedUp.current = true;
      setLoadingModel(true);
      warmUpSearch();
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!next.trim()) {
      onResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await search(next, 8);
        onResults(results.map((r) => r.id));
      } finally {
        setSearching(false);
        setLoadingModel(false);
      }
    }, 300);
  }

  return (
    <div>
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search datasets: coral bleaching, fish landings, SST..."
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {(loadingModel || searching) && (
        <p className="mt-1 text-xs text-slate-500">
          {loadingModel && !searching ? 'Loading search model (first search only)…' : 'Searching…'}
        </p>
      )}
    </div>
  );
}
