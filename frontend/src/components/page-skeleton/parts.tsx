import type { ReactNode } from 'react';
import { Container, Skeleton } from '@/components/ui';
import { OfferCardSkeleton } from '@/features/offers/OfferCard';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

/*
 * The pieces page skeletons are built from, and the skeletons a page shares
 * with its route fallback. A skeleton that does not match what replaces it
 * jolts on load, so each bar sits in a box the height of the real line of
 * type, and a page and its fallback draw the same frame from here.
 */

type TextSize = '2xs' | 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

/** One line of each size: the font size times its line height in theme.css. */
const LINE: Record<TextSize, string> = {
  '2xs': 'h-4',
  xs: 'h-4.5',
  sm: 'h-5',
  base: 'h-6',
  md: 'h-7',
  lg: 'h-7',
  xl: 'h-8',
  '2xl': 'h-9',
  '3xl': 'h-10.5',
  '4xl': 'h-13',
  '5xl': 'h-15.5',
};

/** The bar within the line: about the height of the letters. */
const BAR: Record<TextSize, string> = {
  '2xs': 'h-2',
  xs: 'h-2.5',
  sm: 'h-3',
  base: 'h-3.5',
  md: 'h-4',
  lg: 'h-4.5',
  xl: 'h-5',
  '2xl': 'h-6',
  '3xl': 'h-7',
  '4xl': 'h-9',
  '5xl': 'h-11',
};

/**
 * Lines of text, one bar per entry in `widths`. `line` and `bar` add classes,
 * for a heading whose size steps up at a breakpoint.
 */
export function Text({
  size = 'md',
  widths = ['w-full'],
  line,
  bar,
  className,
}: {
  size?: TextSize;
  widths?: string[];
  line?: string;
  bar?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {widths.map((width, index) => (
        <div key={index} className={cn('flex items-center', LINE[size], line)}>
          <Skeleton className={cn(BAR[size], 'max-w-full', width, bar)} />
        </div>
      ))}
    </div>
  );
}

/** `Eyebrow`: one short uppercase line. */
export function EyebrowLine({ className }: { className?: string }) {
  return <Text size="xs" widths={['w-28']} className={className} />;
}

/** `Input` or `Select`: label over a 44px control. */
export function Field({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Text size="sm" widths={['w-24']} />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/** A button of each size, as `buttonStyles` draws it. */
export function ButtonShape({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <Skeleton
      className={cn(
        size === 'sm' && 'h-11 w-24 pointer-fine:h-9',
        size === 'md' && 'h-11 w-32',
        size === 'lg' && 'h-12 w-36',
        className,
      )}
    />
  );
}

/** The pill `Tabs` track. */
export function TabsShape({ className }: { className?: string }) {
  return <Skeleton className={cn('h-12 w-60', className)} />;
}

/** `AccountPageHeading`: the back chevron and an `text-2xl` title. */
export function AccountHeadingShape({ width = 'w-48' }: { width?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="-ml-2 grid size-11 shrink-0 place-items-center">
        <Skeleton className="size-5" />
      </span>
      <Text size="2xl" widths={[width]} className="min-w-0 flex-1" />
    </div>
  );
}

/** `SectionHeading` as a page title: eyebrow, `text-3xl` title, description. */
export function SectionHeadingShape({
  title = 'w-56',
  description = ['w-full', 'w-2/3'],
  action = false,
}: {
  title?: string;
  description?: string[];
  action?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="min-w-0 max-w-2xl flex-1">
        <EyebrowLine className="mb-3" />
        <Text size="3xl" widths={[title]} />
        {description.length > 0 && <Text widths={description} className="mt-2.5" />}
      </div>
      {action && (
        <div className="shrink-0 pb-1">
          <ButtonShape size="sm" className="w-36" />
        </div>
      )}
    </div>
  );
}

/** The usual page opening: eyebrow, a `text-3xl md:text-4xl` title, one paragraph. */
export function PageIntroShape({
  title = 'w-64',
  description = ['w-full', 'w-1/2'],
  titleGap = 'mt-3',
}: {
  title?: string;
  description?: string[];
  titleGap?: 'mt-3' | 'mt-4';
}) {
  return (
    <>
      <EyebrowLine />
      <Text size="3xl" widths={[title]} line="md:h-13" bar="md:h-9" className={titleGap} />
      {description.length > 0 && (
        <Text widths={description} className="mt-3 max-w-xl" />
      )}
    </>
  );
}

/** A page's `<main>`: clear of the phone tab bar, in the page's container. */
export function PageMain({
  width = 'narrow',
  className = 'py-(--section-gap)',
  children,
}: {
  width?: 'prose' | 'narrow' | 'default' | 'wide';
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className={pbBottomNav}>
      <Container width={width} className={className}>
        {children}
      </Container>
    </main>
  );
}

/* ------------------------------------------------------------------------
   Shared with the pages: each is what its page shows while its data loads.
   ------------------------------------------------------------------------ */

const cardFrame = 'rounded-md border border-hairline bg-surface shadow-xs';

/** An Account hub row: the icon tile, label and summary, the chevron. */
function HubRowShape({ label = 'w-28', summary = 'w-44' }: { label?: string; summary?: string }) {
  return (
    <li className="flex min-h-14 items-center gap-4 px-5 py-4">
      <Skeleton className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <Text size="sm" widths={[label]} />
        <Text size="sm" widths={[summary]} className="mt-0.5" />
      </div>
      <Skeleton className="size-4 shrink-0" />
    </li>
  );
}

/** Account: the profile summary card and the two hub cards. */
export function AccountSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={cn(cardFrame, 'mt-8 p-5 sm:flex sm:gap-6 sm:p-8')}>
        <Skeleton radius="full" className="size-20 shrink-0 sm:size-28" />
        <div className="mt-4 min-w-0 flex-1 sm:mt-0">
          <Text size="2xl" widths={['w-48']} />
          <Text size="sm" widths={['w-28']} className="mt-0.5" />
          <Text size="sm" widths={['w-32']} className="mt-1.5" />
        </div>
        <div className="mt-5 sm:mt-0 sm:w-44 sm:shrink-0">
          <ButtonShape className="w-full" />
        </div>
      </div>
      <div className="mt-6 grid items-start gap-6 md:grid-cols-2">
        <div className={cn(cardFrame, 'overflow-hidden')}>
          <Text size="xl" widths={['w-36']} className="px-5 pt-5 pb-3" />
          <ul className="divide-y divide-hairline border-t border-hairline">
            <HubRowShape />
            <HubRowShape label="w-24" summary="w-52" />
            <HubRowShape label="w-16" summary="w-48" />
          </ul>
        </div>
        <div className={cn(cardFrame, 'overflow-hidden')}>
          <Text size="xl" widths={['w-24']} className="px-5 pt-5 pb-3" />
          <ul className="divide-y divide-hairline border-t border-hairline">
            <li className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-start gap-4">
                <Skeleton className="size-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Text size="sm" widths={['w-24']} />
                  <Text size="sm" widths={['w-64']} className="mt-0.5" />
                </div>
              </div>
              <div className="sm:pl-13">
                <Skeleton className="h-12 w-full sm:w-52" />
              </div>
            </li>
            <HubRowShape label="w-20" summary="w-40" />
          </ul>
        </div>
      </div>
    </div>
  );
}

/** A creative's profile: cover, identity, the tabs and their first offers. */
export function ProfileSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton radius="md" className="h-32 w-full sm:h-44 lg:h-56 short:h-24" />
      <div className="relative -mt-14 flex flex-col items-center sm:-mt-16 lg:flex-row lg:items-start lg:gap-6 lg:px-8">
        <span className="rounded-full bg-paper p-1">
          <Skeleton radius="full" className="size-28" />
        </span>
        <div className="mt-4 flex flex-col items-center gap-2 lg:mt-0 lg:items-start lg:pt-18">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="mt-5 flex flex-col items-center lg:items-start lg:px-8">
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)]">
        <div>
          <Skeleton className="h-11 w-full" />
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <OfferCardSkeleton key={i} />
            ))}
          </ul>
        </div>
        <Skeleton radius="md" className="hidden h-96 lg:block" />
      </div>
    </div>
  );
}

/** An offer: hero, title and price, provider, description, similar offers. */
export function OfferDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton
        radius="md"
        className="aspect-video w-full short:aspect-auto short:h-40 lg:aspect-21/9"
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:gap-x-10">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-6 w-40" />
          <div className="mt-6 flex items-center gap-3 border-y border-hairline py-4">
            <Skeleton radius="full" className="size-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <Skeleton radius="md" className="hidden h-56 lg:block" />
      </div>
      <ul className="mt-16 hidden gap-4 lg:grid lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <OfferCardSkeleton key={i} compact />
        ))}
      </ul>
    </div>
  );
}

/** The creative profile step: its opening, then the profile fields. */
export function ProfileSetupSkeleton() {
  return (
    <div aria-hidden="true">
      <PageIntroShape title="w-64" />
      <div className="mt-10 space-y-4">
        <Text size="lg" widths={['w-32']} />
        <Field />
        <div className="flex flex-col gap-1.5">
          <Text size="sm" widths={['w-12']} />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    </div>
  );
}

/** The landing page's nine domains, fading out down the list. */
export function DomainListSkeleton() {
  return (
    <div className="border-t border-hairline">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-8 border-b border-hairline py-6 last:border-b-0"
          style={{ opacity: 1 - index * 0.14 }}
        >
          <Skeleton className="h-7 w-10 shrink-0" />
          <Skeleton className="h-6 w-52 shrink-0" />
          <Skeleton className="hidden h-4 flex-1 md:block" />
        </div>
      ))}
    </div>
  );
}

/** `Badge`: one line of `text-xs` in a `py-0.5` chip. */
export function BadgeShape({ className }: { className?: string }) {
  return <Skeleton radius="xs" className={cn('h-5.5 w-20 shrink-0', className)} />;
}

/**
 * History's bordered rows: a 56px thumbnail, an avatar, or a state chip
 * beside the title; then price, party, and a status line unless `meta` is off.
 */
export function ListRowsSkeleton({
  lead = 'thumb',
  meta = true,
  action = false,
}: {
  lead?: 'thumb' | 'avatar' | 'chip';
  meta?: boolean;
  action?: boolean;
}) {
  return (
    <ul className="divide-y divide-hairline border border-hairline" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-4">
          {lead === 'thumb' && <Skeleton className="size-14 shrink-0" />}
          {lead === 'avatar' && <Skeleton radius="full" className="mt-0.5 size-8 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <Text size="base" widths={['w-48']} className="min-w-0" />
              {lead === 'chip' && <BadgeShape />}
            </div>
            <Text size="sm" widths={['w-24']} className="mt-0.5" />
            <Text size="sm" widths={['w-40']} className="mt-1" />
            {meta && <Text size="xs" widths={['w-36']} className="mt-2" />}
          </div>
          {action && <ButtonShape size="sm" className="w-20" />}
        </li>
      ))}
    </ul>
  );
}

/** Your postings: a display title, budget and place, badges, then its buttons. */
export function PostingRowsSkeleton() {
  return (
    <ul className="divide-y divide-hairline border border-hairline" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Text size="lg" widths={['w-52']} />
              <Text size="sm" widths={['w-64']} className="mt-1" />
              <div className="mt-2 flex gap-2">
                <BadgeShape className="w-24" />
                <BadgeShape className="w-16" />
              </div>
            </div>
            <div className="flex gap-2">
              <ButtonShape size="sm" className="w-16" />
              <ButtonShape size="sm" className="w-16" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Notifications: an avatar and two lines per row, under hairlines. */
export function NotificationRowsSkeleton() {
  return (
    <ul className="mt-8 divide-y divide-hairline" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton radius="full" className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <Text size="sm" widths={['w-72']} />
            <Text size="2xs" widths={['w-16']} className="mt-1" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A client's posting: title, budget and place, the brief, who posted it. */
export function PostingDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <EyebrowLine />
      <Text size="4xl" widths={['w-2/3']} className="mt-3" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Text size="sm" widths={['w-32']} className="mt-2" />
      <Text widths={['w-full', 'w-full', 'w-3/4']} className="mt-8" />
      <div className="mt-10 flex items-center gap-4 border-t border-hairline pt-8">
        <Skeleton radius="full" className="size-12 shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="u-rule my-12" />
      <div className="flex flex-wrap gap-3">
        <ButtonShape size="lg" />
        <ButtonShape size="lg" />
      </div>
    </div>
  );
}

/** A work agreement: the way back, the title, the package and its money. */
export function AgreementSkeleton() {
  return (
    <div aria-hidden="true">
      <Text size="sm" widths={['w-44']} />
      <EyebrowLine className="mt-6" />
      <Text size="4xl" widths={['w-2/3']} className="mt-3" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-8 rounded-md border border-hairline bg-surface p-5">
        <Text size="base" widths={['w-32']} />
        <div className="mt-3 divide-y divide-hairline">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2">
              <Text size="base" widths={['w-40']} className="flex-1" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-hairline-strong pt-3">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Text size="xs" widths={['w-16']} />
              <Text size="base" widths={['w-24']} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <ButtonShape />
        <ButtonShape />
      </div>
    </div>
  );
}

/** The inbox's rows, in the same bordered list the threads arrive in. */
export function ConversationRowsSkeleton() {
  return (
    <ul
      className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-surface shadow-xs lg:rounded-none lg:border-0 lg:shadow-none"
      aria-label="Loading conversations"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex min-h-16 items-center gap-3.5 px-4 py-4 sm:px-5">
          <Skeleton radius="full" className="size-12 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0 self-start" />
        </li>
      ))}
    </ul>
  );
}

/** A conversation while its thread loads: the chat bar, the party row, messages. */
export function ThreadSkeleton() {
  return (
    <div className={cn(pbBottomNav, 'lg:flex lg:h-full lg:flex-col')} aria-hidden="true">
      <div className="sticky top-(--staging-banner-h) z-40 flex h-14 items-center gap-1 border-b border-hairline bg-paper/90 px-1 short:top-0 sm:hidden">
        <span className="grid size-11 shrink-0 place-items-center">
          <Skeleton className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <Skeleton radius="full" className="size-8 shrink-0" />
          <Skeleton className="h-4 w-28" />
        </div>
        <span className="size-11 shrink-0" />
      </div>
      <Container
        width="narrow"
        className="py-(--section-gap) max-sm:py-4 lg:flex lg:min-h-0 lg:max-w-none lg:flex-1 lg:flex-col lg:p-0"
      >
        <div className="mb-4 hidden items-center justify-between gap-4 sm:flex lg:mb-0 lg:border-b lg:border-hairline lg:px-5 lg:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center lg:hidden">
              <Skeleton className="size-5" />
            </span>
            <Skeleton radius="full" className="size-12 shrink-0" />
            <Skeleton className="h-8 w-40" />
          </div>
          <span className="size-11 shrink-0" />
        </div>
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5 lg:py-4">
          <MessageBubblesSkeleton />
        </div>
      </Container>
    </div>
  );
}

/** The thread's messages, alternating sides. */
export function MessageBubblesSkeleton() {
  return (
    <div className="space-y-4 lg:p-5" aria-hidden="true">
      <Skeleton radius="md" className="h-14 w-2/3" />
      <Skeleton radius="md" className="ml-auto h-10 w-1/2" />
      <Skeleton radius="md" className="h-20 w-3/5" />
      <Skeleton radius="md" className="ml-auto h-10 w-2/5" />
    </div>
  );
}
