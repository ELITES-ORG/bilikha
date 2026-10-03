import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@/components/ui';
import { CornerBlob } from './Decor';
import { Wordmark } from './Wordmark';

export interface AuthShellProps {
  /** Top-right control — the link across to the other auth page. */
  action: ReactNode;
  /** Rendered between the header and the content, e.g. a status banner. */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * Frame for sign-in and registration: the wordmark, one control, and the
 * navy-and-red corner shapes. The shapes sit in the page margins and behind
 * the content, so they never take a tap or cover a field.
 */
export function AuthShell({ action, banner, children }: AuthShellProps) {
  return (
    <div className="relative min-h-page overflow-hidden bg-paper">
      <CornerBlob placement="top-right" className="opacity-95" />
      {/* Only where the page margin is wide enough to hold it clear of the form. */}
      <CornerBlob placement="bottom-left" className="hidden opacity-95 xl:block" />

      <header className="relative">
        <Container width="narrow" className="flex h-20 items-center justify-between gap-4 pr-32 sm:pr-40 xl:pr-(--gutter)">
          <Link to="/" className="inline-flex items-center">
            <Wordmark />
          </Link>
          {action}
        </Container>
      </header>
      {banner}

      <main className="relative">
        <Container width="narrow" className="pt-6 pb-(--section-gap) sm:pt-10">
          {children}
        </Container>
      </main>
    </div>
  );
}
