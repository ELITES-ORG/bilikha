import { useRef, useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { PesoInput } from '@/features/offers/PesoInput';
import { toFieldErrors } from '@/features/auth/field-errors';
import { toApiError } from '@/lib/api-client';
import { centavosToPesoInput, formatPesos, pesoInputToCentavos } from '@/lib/money';
import { useIssueAgreement } from './api';
import { durationLine, endDateOf, formatDate, todayAsDateInput } from './format';
import type { Agreement, IssueAgreementPayload } from './types';

/** Matches the server's cap; thirty services is generous for one package. */
const LINE_LIMIT = 30;

type LineDraft = { key: number; description: string; price: string };

type ComposerState = {
  packageTitle: string;
  notes: string;
  startDate: string;
  durationDays: string;
  lines: LineDraft[];
};

function blankState(): ComposerState {
  return {
    packageTitle: '',
    notes: '',
    startDate: todayAsDateInput(),
    durationDays: '7',
    lines: [{ key: 0, description: '', price: '' }],
  };
}

function stateFrom(previous: Agreement): ComposerState {
  return {
    packageTitle: previous.packageTitle,
    notes: previous.notes ?? '',
    startDate: previous.startDate,
    durationDays: String(previous.durationDays),
    lines: previous.lineItems.map((item, index) => ({
      key: index,
      description: item.description,
      price: centavosToPesoInput(item.priceCentavos),
    })),
  };
}

interface AgreementComposerProps {
  conversationId: string;
  /**
   * The version this one replaces. Set when answering a request for changes:
   * the form opens prefilled from it and sends `supersedesId`.
   */
  supersedes?: Agreement | null;
  onIssued: () => void;
  onCancel: () => void;
}

/**
 * The creative's package: lines with prices, a start date and a duration.
 *
 * This renders its own `<form>`, so it must stay a *sibling* of the thread's
 * reply form and never a child of it — a nested `<form>` silently swallows the
 * inner submit.
 */
export function AgreementComposer({
  conversationId,
  supersedes,
  onIssued,
  onCancel,
}: AgreementComposerProps) {
  const toast = useToast();
  const issue = useIssueAgreement(conversationId);
  const nextKey = useRef(supersedes ? supersedes.lineItems.length : 1);
  const [form, setForm] = useState<ComposerState>(() =>
    supersedes ? stateFrom(supersedes) : blankState(),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const durationDays = Number(form.durationDays);
  // Both worked out here, for the eye only. Neither is ever sent: the server
  // holds no column for a total or an end date (ADR 0029).
  const totalCentavos = form.lines.reduce(
    (sum, line) => sum + (pesoInputToCentavos(line.price) ?? 0),
    0,
  );
  const endDate =
    Number.isInteger(durationDays) && durationDays > 0
      ? endDateOf(form.startDate, durationDays)
      : '';

  function update<K extends keyof ComposerState>(key: K, value: ComposerState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function updateLine(key: number, patch: Partial<Omit<LineDraft, 'key'>>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function addLine() {
    const key = nextKey.current;
    nextKey.current += 1;
    setForm((current) => ({
      ...current,
      lines: [...current.lines, { key, description: '', price: '' }],
    }));
  }

  function removeLine(key: number) {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.key !== key),
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const title = form.packageTitle.trim();

    /*
     * A row carrying a price but no description used to be dropped here
     * without a word, because the filter keyed on the description alone — so a
     * priced service the creative had typed simply vanished from the agreement
     * they sent. Say so instead.
     */
    const pricedButUnnamed = form.lines.filter(
      (line) => !line.description.trim() && pesoInputToCentavos(line.price) !== undefined,
    );

    const lineItems = form.lines
      .filter((line) => line.description.trim().length > 0)
      .map((line) => ({
        description: line.description.trim(),
        priceCentavos: pesoInputToCentavos(line.price) ?? 0,
      }));

    if (!title) {
      setFieldErrors({ packageTitle: 'Give the package a title' });
      return;
    }
    if (pricedButUnnamed.length > 0) {
      setFieldErrors(
        Object.fromEntries(
          pricedButUnnamed.map((line) => [`line-${line.key}`, 'Say what this service covers']),
        ),
      );
      setFormError('A service with a price needs a description, or remove it.');
      return;
    }
    if (lineItems.length === 0) {
      setFormError('Add at least one service saying what the package covers.');
      return;
    }
    if (!form.startDate) {
      setFieldErrors({ startDate: 'Say when the work starts' });
      return;
    }
    if (!Number.isInteger(durationDays) || durationDays < 1) {
      setFieldErrors({ durationDays: 'Duration is at least one day' });
      return;
    }

    const payload: IssueAgreementPayload = {
      packageTitle: title,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      startDate: form.startDate,
      durationDays,
      lineItems,
      ...(supersedes ? { supersedesId: supersedes.id } : {}),
    };

    try {
      await toast.run('Sending work agreement…', () => issue.mutateAsync(payload), {
        success: supersedes ? 'Updated work agreement sent' : 'Work agreement sent',
        error: (error) => toApiError(error).message,
      });
      setForm(blankState());
      onIssued();
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
        return;
      }
      setFormError(toApiError(error).message);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="space-y-4 rounded-sm border border-hairline bg-surface p-4"
      noValidate
    >
      <div>
        <h2 className="text-base font-medium text-ink">
          {supersedes ? `Replace version ${supersedes.version}` : 'Draft a work agreement'}
        </h2>
        <p className="mt-1 text-sm text-ink-muted text-pretty">
          List what the package covers and what each part costs. The client reviews it in this
          conversation and either asks for changes or accepts it.
        </p>
      </div>

      {formError && (
        <p
          className="rounded-sm border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
          role="alert"
        >
          {formError}
        </p>
      )}

      <Input
        label="Package title"
        required
        maxLength={120}
        value={form.packageTitle}
        onChange={(event) => update('packageTitle', event.target.value)}
        error={fieldErrors.packageTitle}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">What it covers</legend>
        {form.lines.map((line, index) => (
          /*
           * Each service is a numbered group rather than a bare row. The
           * previous shape labelled only the first row and left the rest with
           * an aria-label alone, so on a phone the second service was two
           * unlabelled boxes.
           */
          <div key={line.key} className="rounded-sm border border-hairline p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Service {index + 1}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={form.lines.length === 1}
                onClick={() => removeLine(line.key)}
              >
                Remove
              </Button>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Input
                  label="Description"
                  maxLength={200}
                  value={line.description}
                  onChange={(event) => updateLine(line.key, { description: event.target.value })}
                  error={fieldErrors[`line-${line.key}`]}
                />
              </div>
              <div className="w-full sm:w-40">
                <PesoInput
                  label="Price (₱)"
                  value={line.price}
                  onValueChange={(price) => updateLine(line.key, { price })}
                />
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={form.lines.length >= LINE_LIMIT}
          onClick={addLine}
        >
          Add a service
        </Button>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Start date"
          type="date"
          required
          value={form.startDate}
          onChange={(event) => update('startDate', event.target.value)}
          error={fieldErrors.startDate}
        />
        <Input
          label="Duration (days)"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          required
          value={form.durationDays}
          onChange={(event) => update('durationDays', event.target.value)}
          error={fieldErrors.durationDays}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="agreement-notes" className="text-sm font-medium text-ink">
          Notes
        </label>
        <textarea
          id="agreement-notes"
          rows={3}
          maxLength={2000}
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
          className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
        />
        <p className="text-xs text-ink-subtle">
          Anything the services do not say — what you need from the client, what is not included.
        </p>
      </div>

      <div className="rounded-sm border border-hairline bg-clay-50 px-3 py-2">
        <p className="text-sm text-ink">
          Total {formatPesos(totalCentavos)}
          {endDate ? ` · ends ${formatDate(endDate)}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-ink-subtle text-pretty">
          Worked out from the services and the dates above, here on this screen. Bilikha does not
          handle payment.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={issue.isPending}>
          {supersedes ? `Send version ${supersedes.version + 1}` : 'Send to client'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={issue.isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        {endDate && (
          <p className="w-full text-xs text-ink-subtle">
            {durationLine(durationDays)} from {formatDate(form.startDate)}.
          </p>
        )}
      </div>
    </form>
  );
}
