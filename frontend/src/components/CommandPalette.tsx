import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../hooks/useRoute';
import type { ThemeMode } from '../hooks/useTheme';
import { api } from '../services/api';
import type { AccountListItem } from '../types';
import { Icon, avatarStyle } from './Icon';
import { PriorityBadge } from './PriorityBadge';

interface Props {
  open: boolean;
  onClose: () => void;
  setTheme: (m: ThemeMode) => void;
}

type Item =
  | { kind: 'account'; id: string; account: AccountListItem }
  | { kind: 'command'; id: string; label: string; hint: string; icon: string; run: () => void };

/** Simple subsequence fuzzy score: higher is better, -1 means no match. */
function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx;
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    score += found === ti ? 3 : 1;
    ti = found + 1;
  }
  return score;
}

export function CommandPalette({ open, onClose, setTheme }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [accounts, setAccounts] = useState<AccountListItem[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    api
      .listAccounts('ALL', 'score')
      .then((r) => setAccounts(r.accounts))
      .catch(() => setAccounts([]));
  }, [open]);

  const commands: Item[] = useMemo(
    () => [
      { kind: 'command', id: 'c-home', label: 'Go to overview', hint: 'Navigation', icon: 'sparkles', run: () => navigate('/') },
      { kind: 'command', id: 'c-dash', label: 'Go to accounts dashboard', hint: 'Navigation', icon: 'layers', run: () => navigate('/accounts') },
      { kind: 'command', id: 'c-light', label: 'Switch to light theme', hint: 'Appearance', icon: 'sun', run: () => setTheme('light') },
      { kind: 'command', id: 'c-dark', label: 'Switch to dark theme', hint: 'Appearance', icon: 'moon', run: () => setTheme('dark') },
      { kind: 'command', id: 'c-sys', label: 'Use system theme', hint: 'Appearance', icon: 'monitor', run: () => setTheme('system') },
    ],
    [setTheme],
  );

  const items: Item[] = useMemo(() => {
    const accountItems: Item[] = (accounts ?? [])
      .map((a) => ({ a, s: fuzzy(query, `${a.name} ${a.industry ?? ''}`) }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => (query ? y.s - x.s : y.a.score - x.a.score))
      .slice(0, 8)
      .map((x) => ({ kind: 'account', id: `a-${x.a.id}`, account: x.a }));
    const commandItems = commands.filter((c) => c.kind === 'command' && fuzzy(query, c.label) >= 0);
    return [...accountItems, ...commandItems];
  }, [accounts, commands, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (item: Item) => {
    onClose();
    if (item.kind === 'account') navigate(`/accounts/${item.account.id}`);
    else item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      run(items[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts or type a command…"
            aria-label="Search accounts or commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${items[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {accounts === null && <div className="palette-empty">Loading accounts…</div>}
          {accounts !== null && items.length === 0 && <div className="palette-empty">No results for “{query}”</div>}
          {items.map((item, i) => {
            const group = item.kind === 'account' ? 'Accounts' : 'Commands';
            const header = group !== lastGroup ? <div className="palette-group">{group}</div> : null;
            lastGroup = group;
            return (
              <div key={item.id}>
                {header}
                <div
                  id={`pi-${item.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item ${i === active ? 'is-active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  {item.kind === 'account' ? (
                    <>
                      <span className="avatar avatar-brand avatar-sm" style={avatarStyle(item.account.name)} aria-hidden="true">
                        {item.account.name.charAt(0)}
                      </span>
                      <span className="palette-main">
                        <span className="palette-label">{item.account.name}</span>
                        <span className="palette-hint">
                          {item.account.industry ?? 'Industry unknown'} · score {item.account.score}
                        </span>
                      </span>
                      <PriorityBadge priority={item.account.priority} />
                    </>
                  ) : (
                    <>
                      <span className="palette-cmd-icon" aria-hidden="true">
                        <Icon name={item.icon} size={15} />
                      </span>
                      <span className="palette-main">
                        <span className="palette-label">{item.label}</span>
                        <span className="palette-hint">{item.hint}</span>
                      </span>
                    </>
                  )}
                  <span className="palette-enter" aria-hidden="true">
                    <Icon name="corner-down-left" size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span>
          <span><kbd>/</kbd> search table</span>
        </div>
      </div>
    </div>
  );
}
