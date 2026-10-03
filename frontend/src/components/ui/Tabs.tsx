import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { segmentItemClass, segmentTrackClass } from './segment-styles';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
}

export interface TabsProps<T extends string> {
  /** Accessible name for the tab list. */
  label: string;
  value: T;
  items: ReadonlyArray<TabItem<T>>;
  onChange: (next: T) => void;
  className?: string;
}

/**
 * Segmented tabs: the active tab is a navy pill, the rest are muted text.
 * Selection only — the caller owns the state and renders the panel.
 */
export function Tabs<T extends string>({ label, value, items, onChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn(segmentTrackClass, className)}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={segmentItemClass(selected)}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
