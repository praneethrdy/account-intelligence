/** Tiny typed event bus for cross-component interactions on the detail page. */
type Events = {
  'highlight-activity': { id: number };
  'focus-score-component': { key: 'fit' | 'intent' | 'engagement' | 'recency' };
  'open-palette': Record<string, never>;
};

export function emit<K extends keyof Events>(name: K, detail: Events[K]): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends keyof Events>(name: K, handler: (detail: Events[K]) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<Events[K]>).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
