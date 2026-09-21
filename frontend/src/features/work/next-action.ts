/**
 * The single most useful next thing for a creative, given their work summary.
 * Pure — no React, no fetching. Priority order is the product logic of the
 * page (ADR 0039 / plan 0027): get it wrong and the hub tells them to add an
 * offer while an unanswered client sits in their inbox.
 */

import type { WorkSummary } from '@contracts/work';

export interface NextAction {
  headline: string;
  body: string;
  to?: string;
}

/**
 * First match wins. Inquiry-awaiting outranks "add an offer" even though a
 * creative with zero offers is common — an unanswered client takes priority.
 */
export function nextAction(summary: WorkSummary): NextAction {
  const { profile, offers, inquiries, agreements } = summary;

  if (profile.status === 'pending_review') {
    return {
      headline: 'Waiting on review',
      body: 'Your profile is with the team. Nothing to do until they decide.',
    };
  }

  if (profile.status === 'suspended') {
    return {
      headline: 'Your profile is suspended',
      body: 'Read why it was suspended and what to change before it can go back up.',
      to: '/account/profile',
    };
  }

  if (profile.editedSinceReviewAt) {
    return {
      headline: 'Your edit is queued',
      body: 'The live version is still up. The changes go public after review.',
    };
  }

  if (inquiries.awaitingYourReply > 0) {
    const n = inquiries.awaitingYourReply;
    return {
      headline: n === 1 ? 'Reply to an inquiry' : `Reply to ${n} inquiries`,
      body: 'A client is waiting on you in Messages.',
      to: '/messages',
    };
  }

  if (offers.total === 0) {
    return {
      headline: 'Add an offer',
      body: 'Clients cannot hire what they cannot see priced.',
      to: '/account/offers',
    };
  }

  if (agreements.inProgress > 0) {
    return {
      headline: 'Mark delivery when the work is done',
      body:
        agreements.inProgress === 1
          ? 'You have an engagement in progress.'
          : `You have ${agreements.inProgress} engagements in progress.`,
      to: '/history',
    };
  }

  if (agreements.awaitingClientConfirmation > 0) {
    return {
      headline: 'Waiting on the client',
      body: 'You marked delivery. Confirmation is theirs to give.',
    };
  }

  return {
    headline: 'You are up to date',
    body: 'Nothing needs your attention right now.',
  };
}
