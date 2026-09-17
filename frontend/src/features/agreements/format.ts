import type { AgreementEventType, AgreementState } from './types';

/**
 * `startDate + durationDays`, the same arithmetic the server does — UTC so the
 * string never slides a day either way. Used for the composer's live preview;
 * the end date is never sent, only shown.
 */
export function endDateOf(startDate: string, durationDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(durationDays)) return '';
  const end = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return '';
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end.toISOString().slice(0, 10);
}

/** Today, as the value a `type="date"` input expects. */
export function todayAsDateInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A `YYYY-MM-DD` date as "3 Oct", carrying the year when it is not this one.
 * Parsed at local midnight: `new Date('2026-10-03')` is UTC, which shows as
 * 2 October anywhere west of Greenwich.
 */
export function formatDate(date: string): string {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** A timestamp, to the minute — a record needs the exact moment, not "3d ago". */
export function formatMoment(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The schedule, from the two dates and nothing else. It says when the work is
 * booked for — never what state the engagement is in, which only an event can
 * say (ADR 0029).
 */
export function scheduleLine(startDate: string, endDate: string): string {
  const today = todayAsDateInput();
  if (startDate > today) return `Starts ${formatDate(startDate)}`;
  if (endDate < today) return `Ended ${formatDate(endDate)}`;
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

export function durationLine(durationDays: number): string {
  return `${durationDays} day${durationDays === 1 ? '' : 's'}`;
}

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger';

export function stateTone(state: AgreementState): BadgeTone {
  switch (state) {
    case 'Awaiting response':
      return 'warning';
    case 'Agreed':
    case 'In progress':
      return 'brand';
    case 'Awaiting confirmation':
      return 'accent';
    case 'Completed':
      return 'success';
    case 'Cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * "In progress · marked by Ana, 3 Oct". A four-month-old state has to read as
 * old, so the state never appears without when it was set and by whom.
 */
export function stateLine(state: {
  state: AgreementState;
  actorName: string | null;
  at: string | null;
}): string {
  // Superseded and withdrawn carry the issue time, not the moment they changed,
  // so they get the word alone rather than a timestamp that reads as wrong.
  if (state.state === 'Superseded' || state.state === 'Withdrawn') return state.state;

  const verb = state.state === 'Awaiting response' ? 'sent' : 'marked';
  const parts: string[] = [];
  if (state.actorName) parts.push(`${verb} by ${state.actorName}`);
  if (state.at) parts.push(formatMoment(state.at));
  return parts.length > 0 ? `${state.state} · ${parts.join(', ')}` : state.state;
}

export function eventLabel(type: AgreementEventType): string {
  switch (type) {
    case 'started':
      return 'Work started';
    case 'delivery_marked':
      return 'Work delivered';
    case 'completion_confirmed':
      return 'Completion confirmed';
    case 'cancelled':
      return 'Cancelled';
  }
}
