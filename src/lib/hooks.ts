import { useMemo } from 'react';
import type { Category, Channel, ContentKind } from '@shared/types';
import { useStore } from '@/store/app';
import { sortChannels } from './utils';

export const ALL = '__all__';
export const FAV = '__fav__';

/** Categories of one kind, without hidden ones. */
export function useCategories(kind: ContentKind): Category[] {
  const data = useStore((s) => s.data);
  const hidden = useStore((s) => s.settings.hiddenCategories);
  const hideEmpty = useStore((s) => s.settings.hideEmptyCategories);
  return useMemo(() => {
    if (!data) return [];
    return data.categories.filter((c) => c.kind === kind && !hidden.includes(c.id) && (!hideEmpty || c.count > 0));
  }, [data, kind, hidden, hideEmpty]);
}

/** Channels of a kind filtered by category (ALL / FAV / category id) and sorted per settings. */
export function useChannelList(kind: ContentKind, categoryId: string | string[] | null, query = ''): Channel[] {
  const data = useStore((s) => s.data);
  const hidden = useStore((s) => s.settings.hiddenCategories);
  const favorites = useStore((s) => s.favorites);
  const sortMode = useStore((s) => (kind === 'live' ? s.settings.channelSort : s.settings.vodSort));
  return useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let list = data.channels.filter((c) => c.kind === kind && !hidden.includes(c.kind + '|' + c.group));
    if (Array.isArray(categoryId)) { const set = new Set(categoryId); list = list.filter((c) => set.has(c.kind + '|' + c.group)); }
    else if (categoryId === FAV) list = list.filter((c) => favorites.includes(c.id));
    else if (categoryId && categoryId !== ALL) list = list.filter((c) => c.kind + '|' + c.group === categoryId);
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return sortChannels(list, sortMode);
  }, [data, kind, Array.isArray(categoryId) ? categoryId.join('\n') : categoryId, query, hidden, favorites, sortMode]);
}

export function useChannelById(id: string | undefined): Channel | undefined {
  const data = useStore((s) => s.data);
  return useMemo(() => (id && data ? data.channels.find((c) => c.id === id) : undefined), [data, id]);
}
