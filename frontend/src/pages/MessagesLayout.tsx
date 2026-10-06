import { Suspense } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { RouteFallback } from '@/components/RouteFallback';
import { Container, EmptyState } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ConversationList } from '@/features/conversations/ConversationList';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

/**
 * /messages and /messages/:id share this frame. The URL is the only state:
 *
 * - Below lg, one screen at a time — the inbox, or the open thread.
 * - From lg, a split view: the inbox on the left stays mounted while the
 *   thread on the right changes, so the list keeps its page and scroll.
 *
 * The thread is lazy and gets its own Suspense, so the inbox stays on screen
 * while that chunk loads.
 */
export function MessagesLayout() {
  const inThread = useMatch('/messages/:id') !== null;

  return (
    <>
      <RegistrationStatusBanner />
      {/* The thread sets its own bottom padding: its composer is fixed on a phone. */}
      <main className={inThread ? undefined : pbBottomNav}>
        <div className="lg:mx-auto lg:grid lg:h-[calc(100dvh-4rem-var(--staging-banner-h))] lg:max-w-7xl lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6 lg:px-(--gutter) lg:py-6">
          <section
            aria-label="Conversations"
            className={cn(
              inThread && 'max-lg:hidden',
              'lg:min-h-0 lg:overflow-y-auto lg:rounded-lg lg:border lg:border-hairline lg:bg-surface',
            )}
          >
            <Container width="narrow" className="py-(--section-gap) lg:max-w-none lg:px-0 lg:py-0">
              <ConversationList />
            </Container>
          </section>

          <section
            aria-label="Conversation"
            className={cn(
              !inThread && 'max-lg:hidden',
              'lg:min-h-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-hairline lg:bg-surface',
            )}
          >
            <Suspense fallback={<RouteFallback chrome={false} />}>
              <Outlet />
            </Suspense>
          </section>
        </div>
      </main>
    </>
  );
}

/** The right pane before a thread is chosen. Only exists from lg. */
export function MessagesEmptyPane() {
  return (
    <div className="hidden h-full items-center justify-center p-8 lg:flex">
      <EmptyState
        className="max-w-md border-0 bg-transparent"
        icon={<MessagesSquare className="size-5" />}
        title="Select a conversation"
        description="Choose a thread on the left to read and reply."
      />
    </div>
  );
}
