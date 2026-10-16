import React, { useMemo, useRef, useState } from 'react';
import type { Category, ContentKind } from '@shared/types';
import { useStore } from '@/store/app';
import { ALL, FAV } from '@/lib/hooks';
import { Icon } from './Icon';
import { useContextMenu, type MenuItem } from './ContextMenu';

export type CategorySelection = string | string[] | null;

interface Props {
  kind: ContentKind;
  cats: Category[];
  selected: CategorySelection;
  onSelect: (sel: CategorySelection) => void;
  total: number;
  favCount: number;
  /** icon for the "all" entry */
  icon: string;
  /** optional extra context-menu entries for a single category */
  extraItems?: (cat: Category) => MenuItem[];
}

export function isMulti(sel: CategorySelection): sel is string[] {
  return Array.isArray(sel);
}

/**
 * Category pane with multi-selection:
 *  - click: single category
 *  - Ctrl/Cmd + click: add / remove a category
 *  - Shift + click: select the range from the last clicked category
 * Right-click offers hide/lock for the current selection.
 */
export function CategoryList({ kind, cats, selected, onSelect, total, favCount, icon, extraItems }: Props) {
  const t = useStore((s) => s.t);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const isLocked = useStore((s) => s.isLocked);
  const requestPin = useStore((s) => s.requestPin);
  const [q, setQ] = useState('');
  const anchor = useRef<string | null>(null);
  const ctx = useContextMenu();

  const list = useMemo(() => (q ? cats.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : cats), [cats, q]);
  const selectedSet = useMemo(() => new Set(isMulti(selected) ? selected : selected ? [selected] : []), [selected]);

  /** Makes sure every locked category in `ids` is unlocked (one PIN prompt); returns the ids that may be shown. */
  const unlockAll = async (ids: string[]): Promise<string[]> => {
    const locked = ids.filter((id) => isLocked(id));
    if (!locked.length) return ids;
    const ok = await requestPin();
    if (!ok) return ids.filter((id) => !isLocked(id));
    useStore.setState((s) => ({ unlocked: [...new Set([...s.unlocked, ...locked])] }));
    return ids;
  };

  const clickCategory = async (e: React.MouseEvent, c: Category) => {
    const idx = list.findIndex((x) => x.id === c.id);
    if (e.shiftKey && anchor.current) {
      const a = list.findIndex((x) => x.id === anchor.current);
      if (a >= 0 && idx >= 0) {
        const [from, to] = a < idx ? [a, idx] : [idx, a];
        const range = list.slice(from, to + 1).map((x) => x.id);
        const base = e.ctrlKey || e.metaKey ? [...selectedSet].filter((id) => id !== ALL && id !== FAV) : [];
        const ids = await unlockAll([...new Set([...base, ...range])]);
        if (ids.length) onSelect(ids.length === 1 ? ids[0] : ids);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const cur = [...selectedSet].filter((id) => id !== ALL && id !== FAV);
      let next: string[];
      if (cur.includes(c.id)) next = cur.filter((id) => id !== c.id);
      else next = (await unlockAll([c.id])).length ? [...cur, c.id] : cur;
      anchor.current = c.id;
      onSelect(next.length === 0 ? ALL : next.length === 1 ? next[0] : next);
      return;
    }
    anchor.current = c.id;
    if ((await unlockAll([c.id])).length) onSelect(c.id);
  };

  const onContext = (e: React.MouseEvent, c: Category) => {
    const ids = selectedSet.has(c.id) && selectedSet.size > 1 ? [...selectedSet].filter((id) => id !== ALL && id !== FAV) : [c.id];
    const many = ids.length > 1;
    const label = (single: string, multi: string) => (many ? `${multi} (${ids.length})` : single);
    const allLocked = ids.every((id) => settings.lockedCategories.includes(id));
    const items: MenuItem[] = [
      { label: label(t.hideCategory, t.hideSelected), icon: 'eyeOff', onClick: () => updateSettings({ hiddenCategories: [...new Set([...settings.hiddenCategories, ...ids])] }) },
    ];
    if (settings.parentalPin) {
      items.push({
        label: label(allLocked ? t.unlockCategory : t.lockCategory, allLocked ? t.unlockSelected : t.lockSelected),
        icon: allLocked ? 'unlock' : 'lock',
        onClick: async () => {
          if (!(await requestPin())) return;
          const cur = useStore.getState().settings.lockedCategories;
          updateSettings({ lockedCategories: allLocked ? cur.filter((x) => !ids.includes(x)) : [...new Set([...cur, ...ids])] });
        },
      });
    }
    if (!many && extraItems) items.push(...extraItems(c));
    ctx.open(e, items);
  };

  return (
    <div className="pane">
      <div className="pane-head" title={t.multiSelectHint}>
        {t.categories} <span className="count">{isMulti(selected) ? `${selected.length} / ${cats.length}` : cats.length}</span>
        <span className="grow" />
        {isMulti(selected) && (
          <button className="iconbtn" style={{ width: 26, height: 26 }} title={t.clearSelection} onClick={() => onSelect(ALL)}><Icon name="x" size={14} /></button>
        )}
      </div>
      <div style={{ padding: '0 10px 8px' }}>
        <div className="search-box" style={{ height: 32 }}><span className="ico"><Icon name="search" size={14} /></span><input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="pane-body" onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}>
        <div className={'cat-item' + (selected === ALL || selected === null ? ' active' : '')} onClick={() => onSelect(ALL)}><Icon name={icon} size={15} /><span className="name">{t.all}</span><span className="count">{total}</span></div>
        <div className={'cat-item' + (selected === FAV ? ' active' : '')} onClick={() => onSelect(FAV)}><Icon name="heart" size={15} /><span className="name">{t.favorites}</span><span className="count">{favCount}</span></div>
        {list.map((c) => (
          <div key={c.id} className={'cat-item' + (selectedSet.has(c.id) ? ' active' : '')} onClick={(e) => clickCategory(e, c)} onContextMenu={(e) => onContext(e, c)} title={c.name}>
            {settings.lockedCategories.includes(c.id) && settings.parentalPin && <span className="lock"><Icon name="lock" size={13} /></span>}
            <span className="name">{c.name}</span>
            <span className="count">{c.count}</span>
          </div>
        ))}
      </div>
      <div className="small muted" style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>{t.multiSelectHint}</div>
      {ctx.el}
    </div>
  );
}

/** Header label for the current selection. */
export function selectionLabel(sel: CategorySelection, cats: Category[], t: { all: string; favorites: string; categories: string }): string {
  if (isMulti(sel)) return `${sel.length} ${t.categories}`;
  if (!sel || sel === ALL) return t.all;
  if (sel === FAV) return t.favorites;
  return cats.find((c) => c.id === sel)?.name || t.categories;
}
