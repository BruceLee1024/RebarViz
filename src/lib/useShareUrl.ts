'use client';

import { useCallback } from 'react';

export function useShareUrl(params: object) {
  const getShareUrl = useCallback(() => {
    const encoded = btoa(encodeURIComponent(JSON.stringify(params)));
    const url = `${window.location.origin}${window.location.pathname}?p=${encoded}`;
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
