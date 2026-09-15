# Add a UI component

This guide covers the mechanics. The *rules* — when to use which variant, colour
policy, motion budget — are in [`frontend/DESIGN.md`](../../frontend/DESIGN.md).
Read that first if you have not.

---

## Where it goes

| Location | For |
|---|---|
| `src/components/ui/` | Generic primitives with no domain knowledge — Button, Badge, Card |
| `src/features/<feature>/components/` | Components that know about profiles, inquiries, the taxonomy |
| `src/pages/` | Route-level composition only |

A component in `ui/` that imports a domain type belongs in `features/`.

## The shape

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-clay-100 text-clay-700',
  brand: 'bg-lawa-50 text-lawa-800',
};

export interface CalloutProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Callout({ tone = 'neutral', className, ...props }: CalloutProps) {
  return (
    <div
      className={cn('rounded-md border border-hairline p-4', TONES[tone], className)}
      {...props}
    />
  );
}
```

Then export it from `src/components/ui/index.ts`.

Points worth copying:

- **Extend the native props interface.** `HTMLAttributes<HTMLDivElement>`,
  `ButtonHTMLAttributes<…>`. Callers get `id`, `aria-*`, `data-*` for free.
- **`className` last through `cn`.** `tailwind-merge` lets a caller override
  `p-4` with `p-6` without a specificity fight.
- **Variants as a `Record<Union, string>`,** not conditional string
  concatenation. The compiler then catches a missing variant.
- **Spread `...props`.** A component that swallows unknown props cannot be made
  accessible by its caller.

## The trap: never interpolate class names

```tsx
// Broken. Renders unstyled, silently, with no build error.
<div className={`bg-${color}-500 text-${size}`} />
```

Tailwind scans source for **complete literal** class names. It cannot see
`bg-${color}-500`, so that CSS is never generated.

Two correct options:

```tsx
// 1. a lookup map of complete literals
const BG: Record<Tone, string> = { neutral: 'bg-clay-100', brand: 'bg-lawa-50' };

// 2. read the token directly, for genuinely dynamic values
<div style={{ backgroundColor: `var(--color-${prefix}-${step})` }} />
```

Option 2 works because [ADR 0010](../decisions/0010-theme-static-tokens.md)
emits every token to `:root`. It is how the style guide renders its colour
ramps.

## Using tokens

Prefer the utility, fall back to the variable:

```tsx
<div className="bg-surface text-ink-muted rounded-md shadow-sm" />
<div style={{ borderRadius: 'var(--radius-lg)' }} />
```

Never introduce a raw hex, a one-off `rgba()` shadow, or an arbitrary pixel
font size. If the system cannot express it, add a token — that is the extension
point.

## Motion

Use the existing classes rather than writing transitions inline:

| Class | For |
|---|---|
| `interactive-press` | Buttons and pressable controls |
| `interactive-lift` | Cards that are themselves links |
| `link-underline` | Inline text links |
| `anim-rise-in` / `anim-fade-in` / `anim-scale-in` | Entrances |
| `skeleton` | Loading placeholders |

Stagger a list by setting `--i` on each child:

```tsx
<li className="anim-rise-in" style={{ '--i': index } as CSSProperties}>
```

Reduced-motion handling is global in `styles/motion.css`. Do not add
`prefers-reduced-motion` blocks to individual components.

## Accessibility

- Focus is defined once globally. Do not add per-component focus rings.
- Interactive elements must be `<button>` or `<a>`. For a link that looks like a
  button, use `ButtonLink` — never a `<button>` inside an `<a>`.
- Label every input. `Input` wires `htmlFor`, `aria-describedby`, and
  `aria-invalid` automatically.
- Icon-only controls need `aria-label`; decorative icons need `aria-hidden`.
- Status is never colour alone — pair it with an icon or a word.

## Add it to the style guide

Anything in `ui/` gets a specimen in `src/pages/StyleGuidePage.tsx`, showing
every variant plus the loading, empty, and disabled states. That page is how
drift gets caught before it spreads.

## Before you commit

- [ ] No interpolated class names
- [ ] No raw colours, shadows, or font sizes
- [ ] Native props interface extended and `...props` spread
- [ ] `className` merged through `cn`
- [ ] Keyboard reachable, focus visible, labelled
- [ ] Specimen added to the style guide
- [ ] `npx oxlint src` and `npm run build` clean
