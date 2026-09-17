import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectGroup = {
  label: string;
  options: SelectOption[];
};

export interface SelectProps {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  name?: string;
}

/**
 * A listbox we draw ourselves, rather than a native <select>.
 *
 * A native select's *option list* is rendered by the platform, not the page —
 * on Android it is an OS dialog that follows the device theme, so a phone in
 * dark mode shows a dark list over a light app and no page CSS can reach it.
 * Drawing it here is the only way the control looks the same everywhere.
 *
 * That means re-implementing what the platform gave us for free, so all of it
 * is here deliberately: roving focus with `aria-activedescendant`, arrow/Home/
 * End movement, type-ahead, Escape returning focus to the trigger, and
 * scrolling the active option into view. Dropping any of them makes this worse
 * than the native control it replaces.
 */
export function Select({
  label,
  hint,
  error,
  placeholder = 'Choose…',
  value,
  onValueChange,
  options,
  groups,
  disabled,
  required,
  id,
  className,
  name,
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-listbox`;
  const messageId = `${triggerId}-message`;
  const message = error ?? hint;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: '', at: 0 });

  // Groups and flat options are the same thing to the keyboard; flatten once so
  // index arithmetic never has to know which shape it was given.
  const resolvedGroups = useMemo<SelectGroup[]>(
    () => groups ?? [{ label: '', options: options ?? [] }],
    [groups, options],
  );
  const flat = useMemo(
    () => resolvedGroups.flatMap((group) => group.options),
    [resolvedGroups],
  );
  // Each option's position in the flat list, resolved once rather than counted
  // during render — keyboard movement and rendering must agree on the index.
  const indexedGroups = useMemo(() => {
    const starts = resolvedGroups.map((_, groupIndex) =>
      resolvedGroups
        .slice(0, groupIndex)
        .reduce((total, group) => total + group.options.length, 0),
    );
    return resolvedGroups.map((group, groupIndex) => ({
      label: group.label,
      options: group.options.map((option, optionIndex) => ({
        ...option,
        index: (starts[groupIndex] ?? 0) + optionIndex,
      })),
    }));
  }, [resolvedGroups]);
  const selected = flat.find((option) => option.value === value) ?? null;

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < flat.length; i += step) {
      if (!flat[i]?.disabled) return i;
    }
    return -1;
  };

  function openList() {
    if (disabled) return;
    const current = flat.findIndex((option) => option.value === value);
    setActiveIndex(current >= 0 ? current : firstEnabled(0, 1));
    setOpen(true);
  }

  function closeList(refocus = true) {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = flat[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    closeList();
  }

  // Close on a click anywhere else. mousedown rather than click, so it closes
  // before the pressed element runs its own handler.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Keep the active option visible when arrowing past the edge of the list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function onKeyDown(event: KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeList();
        return;
      case 'Tab':
        // Tab commits nothing and moves on, as a native select does.
        closeList(false);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(activeIndex);
        return;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((current) => {
          const next = firstEnabled(current + 1, 1);
          return next === -1 ? current : next;
        });
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((current) => {
          const next = firstEnabled(current - 1, -1);
          return next === -1 ? current : next;
        });
        return;
      case 'Home':
        event.preventDefault();
        setActiveIndex(firstEnabled(0, 1));
        return;
      case 'End':
        event.preventDefault();
        setActiveIndex(firstEnabled(flat.length - 1, -1));
        return;
      default:
        break;
    }

    // Type-ahead: successive letters within a second extend the search, which
    // is how a native select behaves and how people find an item in 81.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const buffer =
        now - typeahead.current.at < 1000
          ? typeahead.current.buffer + event.key
          : event.key;
      typeahead.current = { buffer, at: now };

      const match = flat.findIndex(
        (option) =>
          !option.disabled && option.label.toLowerCase().startsWith(buffer.toLowerCase()),
      );
      if (match >= 0) setActiveIndex(match);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={triggerId} className="text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="text-danger-600 ms-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div ref={wrapperRef} className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${triggerId}-option-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          aria-required={required}
          disabled={disabled}
          onClick={() => (open ? closeList(false) : openList())}
          onKeyDown={onKeyDown}
          className={cn(
            'flex h-[2.375rem] w-full items-center justify-between gap-2 rounded-sm border',
            'bg-surface px-3 text-left text-base text-ink',
            'transition-[border-color,box-shadow]',
            'focus:outline-none focus-visible:outline-none',
            error
              ? 'border-danger-500 focus-visible:border-danger-600 focus-visible:ring-2 focus-visible:ring-danger-100'
              : 'border-hairline-strong hover:border-clay-400 focus-visible:border-lawa-600 focus-visible:ring-2 focus-visible:ring-lawa-100',
            'disabled:cursor-not-allowed disabled:bg-clay-100 disabled:text-clay-500',
            className,
          )}
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          <span className={cn('truncate', !selected && 'text-ink-subtle')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-ink-subtle transition-transform', open && 'rotate-180')}
            style={{ transitionDuration: 'var(--duration-fast)' }}
            aria-hidden
          />
        </button>

        {/* Submitted with the form, and keeps the value visible to anything
            reading form data. Never focusable — the button is the control. */}
        {name && <input type="hidden" name={name} value={value} />}

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? triggerId : undefined}
            tabIndex={-1}
            className={cn(
              'anim-scale-in absolute top-full right-0 left-0 z-30 mt-1 origin-top',
              'max-h-[min(18rem,50vh)] overflow-y-auto overscroll-contain',
              'rounded-sm border border-hairline-strong bg-surface py-1 shadow-lg',
            )}
          >
            {indexedGroups.map((group) => (
              <li key={group.label || '__ungrouped'} role="presentation">
                {group.label && (
                  <p className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-wide text-ink-subtle uppercase">
                    {group.label}
                  </p>
                )}
                <ul role="presentation">
                  {group.options.map((option) => {
                    const { index } = option;
                    const isSelected = option.value === value;
                    const isActive = index === activeIndex;

                    return (
                      <li
                        key={option.value}
                        id={`${triggerId}-option-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled}
                        onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                        onClick={() => choose(index)}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-base',
                          // min-h keeps a comfortable touch target on a phone,
                          // where this list replaces the OS picker.
                          'min-h-11 sm:min-h-0 sm:py-1.5',
                          option.disabled && 'cursor-not-allowed text-clay-500',
                          !option.disabled && isActive && 'bg-clay-100',
                          !option.disabled && !isActive && 'text-ink',
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="size-4 shrink-0 text-lawa-700" aria-hidden />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}

            {flat.length === 0 && (
              <li role="presentation" className="px-3 py-2 text-sm text-ink-subtle">
                Nothing to choose from
              </li>
            )}
          </ul>
        )}
      </div>

      {message && (
        <p id={messageId} className={cn('text-xs', error ? 'text-danger-700' : 'text-ink-subtle')}>
          {message}
        </p>
      )}
    </div>
  );
}
