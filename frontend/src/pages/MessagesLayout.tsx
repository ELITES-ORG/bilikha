import { Suspense } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { RouteFallback } from '@/components/RouteFallback';
import { Container, EmptyState } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ConversationList } from '@/features/conversations/ConversationList';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * /messages and /messages/:id share this frame. The URL is the only state:
 *
 * - Below lg, one screen at a time — the inbox, or the open thread.
 * - From lg, a split view: the inbox on the left stays mounted while the
 *   thread on the right changes, so the list keeps its page and scroll.
 *
 * The thread is lazy and gets its own Suspense, so the inbox stays on screen
 * while that chunk loads.
 *
 * The thread is keyed by its id. The split view switches threads without
 * leaving this route, so an unkeyed thread would keep the previous one's
 * typed reply, blocked state and open menus — and send that reply to the
 * next person.
 *
 * Below lg with a thread open, the inbox is not rendered at all rather than
 * hidden: hidden, it would still fetch a list nobody can see.
 */
export function MessagesLayout() {
  const threadId = useMatch('/messages/:id')?.params.id;
  const inThread = threadId !== undefined;
  const splitView = useMediaQuery('(min-width: 64rem)');

  return (
    // From lg the frame fills the screen under the header (4rem plus its 1px
    // border), and the registration banner, when shown, takes its share.
    <div className="lg:flex lg:h-[calc(100dvh-4rem-1px-var(--staging-banner-h))] lg:flex-col">
      <RegistrationStatusBanner />
      {/* The thread sets its own bottom padding: its composer is fixed on a phone. */}
      <main className={cn(inThread ? undefined : pbBottomNav, 'lg:min-h-0 lg:flex-1')}>
        <div className="lg:mx-auto lg:grid lg:h-full lg:max-w-7xl lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6 lg:px-(--gutter) lg:py-6">
          {(!inThread || splitView) && (
            <section
              aria-label="Conversations"
              className="lg:min-h-0 lg:overflow-y-auto lg:rounded-lg lg:border lg:border-hairline lg:bg-surface"
            >
              <Container
                width="narrow"
                className="py-(--section-gap) lg:max-w-none lg:px-0 lg:py-0"
              >
                <ConversationList />
              </Container>
            </section>
          )}

          <section
            aria-label="Conversation"
            className={cn(
              !inThread && 'max-lg:hidden',
              'lg:min-h-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-hairline lg:bg-surface',
            )}
          >
            <Suspense fallback={<RouteFallback chrome={false} />}>
              <Outlet key={threadId} />
            </Suspense>
          </section>
        </div>
      </main>
    </div>
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
