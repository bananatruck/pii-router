import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync);
      return () => mql.removeEventListener('change', sync);
    }
    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, [query]);

  return matches;
}