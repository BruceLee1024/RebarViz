'use client';

import { useCallback } from 'react';

export function useShareUrl(params: object) {
  const getShareUrl = useCallback(() => {
    const encoded = btoa(encodeURIComponent(JSON.stringify(params)));
    const query = new URLSearchParams();
    const current = new URLSearchParams(window.location.search);
    if (window.location.pathname.replace(/\/$/, '').endsWith('/beam')) for (const key of ['kind', 'system']) {
      const value = current.get(key); if (value) query.set(key, value);
    }
    query.set('p', encoded);
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    return url;
  }, [params]);

  const copyShareUrl = useCallback(async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [getShareUrl]);

  return { getShareUrl, copyShareUrl };
}

export function decodeShareParams<T>(searchStr: string): T | null {
  try {
    const url = new URL(searchStr, 'http://localhost');
    const p = url.searchParams.get('p');
    if (!p) return null;
    return JSON.parse(decodeURIComponent(atob(p))) as T;
  } catch {
    return null;
  }
}
