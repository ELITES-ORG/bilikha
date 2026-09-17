import type { CSSProperties } from 'react';
import { ButtonLink, Container } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pbBottomNav } from '@/lib/bottom-nav';

export function NotFoundPage() {
  return (
    // A landmark, not decoration: every other page has one, screen readers
    // announce it, and the navigation transition is keyed on `main`.
    <main>
      <Container
        width="narrow"
        className={cn('flex min-h-svh flex-col justify-center py-24', pbBottomNav)}
      >
        <p className="u-eyebrow anim-fade-in">Error 404</p>

        <h1 className="u-display anim-rise-in mt-4 text-4xl">This page does not exist.</h1>

        <p
          className="anim-rise-in mt-4 max-w-md text-md text-ink-muted"
          style={{ '--i': 1 } as CSSProperties}
        >
          The link may be out of date, or the profile it pointed to has been removed.
        </p>

        <div className="anim-rise-in mt-8" style={{ '--i': 2 } as CSSProperties}>
          <ButtonLink to="/">Back to the registry</ButtonLink>
        </div>

        <div className="u-rule mt-16" />
      </Container>
    </main>
  );
}
