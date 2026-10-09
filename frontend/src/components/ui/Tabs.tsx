import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
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
  /**
   * `pill` (default) for filters and modes. `underline` for the sections of a
   * page, where a row of pills would shout louder than the content.
   */
  variant?: 'pill' | 'underline';
  /**
   * When set, each tab gets `id="{idPrefix}-tab-{value}"` and controls
   * `{idPrefix}-panel-{value}`, so the caller's panel can be a real tabpanel.
   */
  idPrefix?: string;
  className?: string;
}

export interface TabPanelsProps<T extends string>
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'aria-labelledby' | 'children' | 'hidden' | 'id' | 'role'
  > {
  idPrefix: string;
  values: ReadonlyArray<T>;
  value: T;
  children?: ReactNode;
}

/**
 * Tabs: selection only — the caller owns the state and renders the panel.
 * Arrow keys move between tabs and select, Home and End jump to the ends, and
 * only the selected tab is in the Tab order (the ARIA tabs pattern).
 */
export function Tabs<T extends string>({
  label,
  value,
  items,
  onChange,
  variant = 'pill',
  idPrefix,
  className,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const underline = variant === 'underline';

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.value === value);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next]!.value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        underline
          ? 'u-no-scrollbar flex gap-6 overflow-x-auto border-b border-hairline'
          : segmentTrackClass,
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.value}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.value}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={
              underline
                ? cn(
                    '-mb-px min-h-11 shrink-0 border-b-2 text-sm whitespace-nowrap transition-colors',
                    selected
                      ? 'border-navy-700 font-semibold text-ink'
                      : 'border-transparent font-medium text-ink-muted hover:text-ink',
                  )
                : segmentItemClass(selected)
            }
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panels controlled by `Tabs`. Every target stays mounted so each tab's
 * `aria-controls` always resolves; only the selected panel exposes content.
 */
export function TabPanels<T extends string>({
  idPrefix,
  values,
  value,
  children,
  ...props
}: TabPanelsProps<T>) {
  return values.map((panelValue) => {
    const selected = panelValue === value;
    return (
      <div
        {...props}
        key={panelValue}
        id={`${idPrefix}-panel-${panelValue}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${panelValue}`}
        hidden={!selected}
      >
        {selected ? children : null}
      </div>
    );
  });
}
