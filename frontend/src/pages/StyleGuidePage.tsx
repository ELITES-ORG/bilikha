import { useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Inbox, Search, Send, Trash2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  Container,
  EmptyState,
  Input,
  Skeleton,
} from '@/components/ui';

/**
 * Living reference for the design system. Not linked from the product; it
 * exists so the team can see every token and primitive in one place and catch
 * drift before it spreads across screens.
 *
 * Swatches and specimens read the CSS custom properties directly rather than
 * composing utility class names at runtime — Tailwind only generates classes it
 * can find as complete literals in the source, so an interpolated
 * `bg-${x}-${y}` would render unstyled.
 */
export function StyleGuidePage() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="py-16">
      <Container width="wide">
        <header className="max-w-2xl">
          <p className="u-eyebrow">Internal reference</p>
          <h1 className="u-display mt-3 text-4xl">Design system</h1>
          <p className="mt-4 text-md text-ink-muted">
            Tokens, primitives, and motion. If something on a screen is not expressible with what
            is on this page, the system needs extending — not the screen overriding.
          </p>
        </header>

        <Section
          title="Colour"
          note="Authored in OKLCH. Steps 600–700 are the accessible text weights on paper."
        >
          <div className="flex flex-col gap-6">
            <Ramp
              name="Clay — neutral"
              prefix="clay"
              steps={[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]}
            />
            <Ramp
              name="Lawa — primary"
              prefix="lawa"
              steps={[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]}
            />
            <Ramp
              name="Palayok — accent (decorative only)"
              prefix="palayok"
              steps={[50, 100, 200, 300, 400, 500, 600, 700, 800, 900]}
            />
            <div className="grid gap-6 sm:grid-cols-3">
              <Ramp name="Success" prefix="success" steps={[50, 100, 500, 600, 700]} compact />
              <Ramp name="Warning" prefix="warning" steps={[50, 100, 500, 600, 700]} compact />
              <Ramp name="Danger" prefix="danger" steps={[50, 100, 500, 600, 700]} compact />
            </div>
          </div>
        </Section>

        <Section
          title="Typography"
          note="Fraunces for display, Archivo for everything else. Tracking tightens as size grows."
        >
          <div className="space-y-6 border-t border-hairline pt-6">
            {DISPLAY_SIZES.map(([size, use]) => (
              <Specimen key={size} size={size} use={use} display>
                Bilikha
              </Specimen>
            ))}

            {TEXT_SIZES.map(([size, use]) => (
              <Specimen key={size} size={size} use={use}>
                Weavers, filmmakers, and festival organisers across eight municipalities.
              </Specimen>
            ))}

            <div className="flex flex-wrap items-baseline gap-x-6">
              <code className="w-16 shrink-0 text-xs text-ink-subtle">2xs</code>
              <span className="u-eyebrow">Uppercase eyebrow label</span>
            </div>
          </div>
        </Section>

        <Section title="Weight" note="Archivo 400/500/600. 700 is reserved for rare emphasis.">
          <div className="flex flex-wrap gap-x-10 gap-y-3 border-t border-hairline pt-6">
            {([400, 500, 600, 700] as const).map((weight) => (
              <div key={weight}>
                <p className="text-lg" style={{ fontWeight: weight }}>
                  Naval, Biliran
                </p>
                <code className="text-xs text-ink-subtle">{weight}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Radius" note="Graded by element size. Uniform rounding flattens hierarchy.">
          <div className="flex flex-wrap gap-4 border-t border-hairline pt-6">
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((r) => (
              <div key={r} className="text-center">
                <div
                  className="size-20 border border-hairline-strong bg-surface shadow-xs"
                  style={{ borderRadius: `var(--radius-${r})` }}
                />
                <code className="mt-2 block text-xs text-ink-subtle">{r}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Elevation"
          note="Ink-tinted, never neutral black. Stop at lg for in-page surfaces."
        >
          <div className="flex flex-wrap gap-5 border-t border-hairline pt-6">
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
              <div key={s} className="text-center">
                <div
                  className="size-24 rounded-md bg-surface"
                  style={{ boxShadow: `var(--shadow-${s})` }}
                />
                <code className="mt-2 block text-xs text-ink-subtle">{s}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons" note="One primary action per view. Everything else steps down.">
          <div className="space-y-5 border-t border-hairline pt-6">
            <Row label="Variants">
              <Button>Send inquiry</Button>
              <Button variant="secondary">Save draft</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="accent">Feature</Button>
              <Button variant="danger" iconLeft={<Trash2 className="size-4" />}>
                Delete
              </Button>
            </Row>

            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>

            <Row label="States">
              <Button iconLeft={<Send className="size-4" />}>With icon</Button>
              <Button
                loading={loading}
                onClick={() => {
                  setLoading(true);
                  window.setTimeout(() => setLoading(false), 1500);
                }}
              >
                Click to load
              </Button>
              <Button disabled>Disabled</Button>
            </Row>
          </div>
        </Section>

        <Section title="Avatar" note="Initials on a token background when there is no photo.">
          <div className="flex flex-wrap items-end gap-6 border-t border-hairline pt-6">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <Avatar src={null} name="Juan dela Cruz" size={size} />
                <code className="text-xs text-ink-subtle">{size} · initials</code>
              </div>
            ))}
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <div key={`src-${size}`} className="flex flex-col items-center gap-2">
                <Avatar
                  src="https://picsum.photos/seed/bilikha-avatar/160"
                  name="Maria Santos"
                  size={size}
                />
                <code className="text-xs text-ink-subtle">{size} · photo</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Badges" note="Status tones always pair with an icon — never colour alone.">
          <div className="border-t border-hairline pt-6">
            <Row label="Tones">
              <Badge>Draft</Badge>
              <Badge tone="brand">Registered</Badge>
              <Badge tone="accent">Visual Arts</Badge>
              <Badge tone="success" icon={<Check className="size-3" />}>
                Verified
              </Badge>
              <Badge tone="warning">Pending</Badge>
              <Badge tone="danger">Suspended</Badge>
            </Row>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-3xl gap-5 border-t border-hairline pt-6 sm:grid-cols-2">
            <Input label="Full name" placeholder="Juan dela Cruz" required />
            <Input
              label="Search"
              placeholder="Craft, name, or town"
              iconLeft={<Search className="size-4" />}
            />
            <Input label="Mobile number" defaultValue="0917" hint="We never show this publicly." />
            <Input label="Email" defaultValue="not-an-email" error="Enter a valid email address." />
            <Input label="Disabled" placeholder="Unavailable" disabled />
          </div>
        </Section>

        <Section title="Cards" note="Hover lift is only for cards that are themselves links.">
          <div className="grid gap-5 border-t border-hairline pt-6 sm:grid-cols-3">
            <Card elevation="flat">
              <CardBody>
                <p className="u-display text-lg">Flat</p>
                <p className="mt-1.5 text-sm text-ink-muted">Hairline only. Dense lists.</p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <p className="u-display text-lg">Base</p>
                <p className="mt-1.5 text-sm text-ink-muted">The default surface.</p>
              </CardBody>
              <CardFooter>
                <span className="text-xs text-ink-subtle">With a footer</span>
              </CardFooter>
            </Card>

            <Card interactive elevation="raised">
              <CardBody>
                <p className="u-display text-lg">Interactive</p>
                <p className="mt-1.5 text-sm text-ink-muted">Hover to see the lift.</p>
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section
          title="Loading and empty"
          note="A province this size will show empty states often. They are a normal state, not an error."
        >
          <div className="grid gap-8 border-t border-hairline pt-6 lg:grid-cols-2">
            <Card>
              <CardBody className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <div className="flex gap-2 pt-2">
                  <Skeleton radius="full" className="h-7 w-20" />
                  <Skeleton radius="full" className="h-7 w-24" />
                </div>
              </CardBody>
            </Card>

            <EmptyState
              icon={<Inbox className="size-5" />}
              title="No circus performers yet"
              description="Nobody has registered under this sub-domain. Try the parent domain, or invite someone you know."
              action={
                <Button size="sm" variant="secondary">
                  Browse Performing Arts
                </Button>
              }
            />
          </div>
        </Section>

        <Section
          title="Motion"
          note="90–200ms for anything the user triggers. Transform and opacity only."
        >
          <div className="grid gap-4 border-t border-hairline pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {DURATIONS.map(([token, ms, use]) => (
              <Card key={token} elevation="flat">
                <CardBody>
                  <code className="text-sm font-medium text-lawa-700">--duration-{token}</code>
                  <p className="mt-1 text-2xl tabular-nums">{ms}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{use}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          <p className="mt-6 text-sm text-ink-muted">
            All of it collapses under <code className="text-ink">prefers-reduced-motion</code>:
            movement is removed, opacity changes survive so state stays legible.
          </p>
        </Section>
      </Container>
    </div>
  );
}

const DISPLAY_SIZES = [
  ['6xl', 'Display'],
  ['5xl', 'Hero'],
  ['4xl', 'Page title'],
  ['3xl', 'Section'],
  ['2xl', 'Subsection'],
  ['xl', 'Card title'],
] as const;

const TEXT_SIZES = [
  ['lg', 'Lead paragraph'],
  ['md', 'Reading body'],
  ['base', 'UI default'],
  ['sm', 'Dense UI, meta'],
  ['xs', 'Captions'],
] as const;

const DURATIONS = [
  ['instant', '90ms', 'Colour, press'],
  ['fast', '140ms', 'Hover, focus'],
  ['base', '200ms', 'Lift, expand'],
  ['slow', '300ms', 'Entrances'],
] as const;

/** Renders one step of the type scale from its tokens, including the tuned
 *  line-height and tracking that Tailwind stores as paired custom properties. */
function Specimen({
  size,
  use,
  display = false,
  children,
}: {
  size: string;
  use: string;
  display?: boolean;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    fontSize: `var(--text-${size})`,
    lineHeight: `var(--text-${size}--line-height)`,
    letterSpacing: `var(--text-${size}--letter-spacing)`,
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <code className="w-16 shrink-0 text-xs text-ink-subtle">{size}</code>
      <span className={display ? 'u-display' : 'max-w-lg'} style={style}>
        {children}
      </span>
      <span className="text-xs text-clay-400">{use}</span>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-16">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
        <h2 className="u-display text-2xl">{title}</h2>
        {note && <p className="max-w-md text-sm text-ink-subtle">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-ink-subtle">{label}</span>
      {children}
    </div>
  );
}

function Ramp({
  name,
  prefix,
  steps,
  compact = false,
}: {
  name: string;
  prefix: string;
  steps: number[];
  compact?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{name}</p>
      <div className="flex overflow-hidden rounded-sm border border-hairline">
        {steps.map((step) => (
          <div key={step} className="flex-1" title={`${prefix}-${step}`}>
            <div
              className={compact ? 'h-10' : 'h-14'}
              style={{ backgroundColor: `var(--color-${prefix}-${step})` }}
            />
            <div className="bg-surface py-1 text-center text-[0.625rem] text-ink-subtle tabular-nums">
              {step}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
