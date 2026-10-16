import React, { useEffect, useRef, useState, useCallback } from 'react';

interface Props<T> {
  items: T[];
  itemHeight: number;
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
  overscan?: number;
  scrollToIndex?: number | null;
  keyOf?: (item: T, index: number) => string | number;
}

export function VirtualList<T>({ items, itemHeight, render, className, overscan = 6, scrollToIndex, keyOf }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 40 });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((el.scrollTop + el.clientHeight) / itemHeight) + overscan);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [itemHeight, items.length, overscan]);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0 || !ref.current) return;
    const el = ref.current;
    const top = scrollToIndex * itemHeight;
    if (top < el.scrollTop || top + itemHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + itemHeight / 2);
    }
  }, [scrollToIndex, itemHeight]);

  const slice = items.slice(range.start, range.end);
  return (
    <div ref={ref} className={className} onScroll={update} style={{ overflowY: 'auto', height: '100%', position: 'relative' }}>
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {slice.map((item, i) => {
          const idx = range.start + i;
          return (
            <div key={keyOf ? keyOf(item, idx) : idx} style={{ position: 'absolute', top: idx * itemHeight, left: 0, right: 0, height: itemHeight }}>
              {render(item, idx)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
