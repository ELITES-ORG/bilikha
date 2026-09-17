import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

const CHOICES = [
  { stars: 1, label: '1 star' },
  { stars: 2, label: '2 stars' },
  { stars: 3, label: '3 stars' },
  { stars: 4, label: '4 stars' },
  { stars: 5, label: '5 stars' },
];

export interface StarRadioGroupProps {
  /** 0 means nothing is chosen yet, so no star is filled. */
  value: number;
  onChange: (stars: number) => void;
  /** Distinct per group: two of these on one page must not share a name. */
  name: string;
  legend: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Five real radio inputs, one per score, each with its own label — not a row of
 * click handlers on icons (plan 0021 step 4.1). Arrow keys move between them
 * for free, the group is one tab stop, and the focus ring is drawn on the star
 * because the input itself is visually hidden.
 */
export function StarRadioGroup({
  value,
  onChange,
  name,
  legend,
  error,
  disabled,
}: StarRadioGroupProps) {
  const messageId = `${name}-message`;

  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-describedby={error ? messageId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-sm font-medium text-ink">{legend}</legend>

      <div className="flex items-center gap-1">
        {CHOICES.map((choice) => (
          <label
            key={choice.stars}
            className={cn('cursor-pointer', disabled && 'cursor-not-allowed')}
          >
            <input
              type="radio"
              name={name}
              value={choice.stars}
              checked={value === choice.stars}
              disabled={disabled}
              onChange={() => onChange(choice.stars)}
              className="peer sr-only"
            />
            <span className="grid size-10 place-items-center rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lawa-700">
              <Star
                aria-hidden
                className={cn(
                  'size-7',
                  choice.stars <= value
                    ? 'fill-palayok-500 text-palayok-600'
                    : 'text-clay-400',
                )}
              />
              <span className="sr-only">{choice.label}</span>
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p id={messageId} className="text-xs text-danger-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
