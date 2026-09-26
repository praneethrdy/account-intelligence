import { useCallback, useEffect, useState } from 'react';

/** Minimal History-API router: "/" (overview), "/accounts" (dashboard) and "/accounts/:id". */
export type Route = { name: 'home' } | { name: 'dashboard' } | { name: 'account'; id: number } | { name: 'notFound' };

function parse(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  if (/^\/accounts\/?$/.test(pathname)) return { name: 'dashboard' };
  const m = pathname.match(/^\/accounts\/([^/]+)\/?$/);
  if (m) {
    const id = Number(m[1]);
    return Number.isInteger(id) && id > 0 ? { name: 'account', id } : { name: 'notFound' };
  }
  return { name: 'notFound' };
}

export function navigate(to: string): void {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

/** onClick handler for <a href> links that keeps navigation client-side. */
export function useLinkHandler() {
  return useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(e.currentTarget.getAttribute('href') ?? '/');
  }, []);
}
