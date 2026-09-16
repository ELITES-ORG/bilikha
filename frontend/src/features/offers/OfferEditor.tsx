import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { useOwnProfile } from '@/features/me/api';
import {
  abandonUpload,
  requestUploadUrl,
  uploadImage,
} from '@/features/media/api';
import {
  addOfferImage,
  createOffer,
  deleteOffer,
  deleteOfferImage,
  listMine,
  reorderOffers,
  updateOffer,
  type OwnOffer,
} from '@/features/offers/api';
import { OFFER_IMAGE_LIMIT, OFFER_LIMIT } from '@/features/offers/limits';
import { useCreativeDomains } from '@/features/taxonomy/api';
import { toApiError } from '@/lib/api-client';
import { DISPLAY_EDGE, THUMB_EDGE, resizeImage } from '@/lib/image';
import { formatPriceRange } from '@/lib/money';

type FormState = {
  title: string;
  subdomainSlug: string;
  description: string;
  priceFrom: string;
  priceTo: string;
};

const emptyForm = (): FormState => ({
  title: '',
  subdomainSlug: '',
  description: '',
  priceFrom: '',
  priceTo: '',
});

function centavosToPesoField(centavos: number | null): string {
  if (centavos == null) return '';
  return String(Math.round(centavos) / 100);
}

function pesosFieldToCentavos(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const pesos = Number(trimmed);
  if (!Number.isFinite(pesos) || pesos <= 0) return undefined;
  return Math.round(pesos * 100);
}

function offerToForm(offer: OwnOffer): FormState {
  return {
    title: offer.title,
    subdomainSlug: offer.subdomainSlug,
    description: offer.description ?? '',
    priceFrom: centavosToPesoField(offer.priceMinCentavos),
    priceTo: centavosToPesoField(offer.priceMaxCentavos),
  };
}

function buildWritePayload(form: FormState, mode: 'create' | 'update') {
  const min = pesosFieldToCentavos(form.priceFrom);
  const max = pesosFieldToCentavos(form.priceTo);
  const base = {
    title: form.title.trim(),
    subdomainSlug: form.subdomainSlug,
  };

  if (mode === 'create') {
    return {
      ...base,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(min != null ? { priceMinCentavos: min } : {}),
      ...(max != null ? { priceMaxCentavos: max } : {}),
    };
  }

  // Update sends every optional field explicitly, null where the creative
  // emptied it. Omitting a key means "leave it alone", so an omitted empty
  // description would be impossible to remove.
  return {
    ...base,
    description: form.description.trim() || null,
    priceMinCentavos: min ?? null,
    priceMaxCentavos: max ?? null,
  };
}

export function OfferEditor() {
  const profile = useOwnProfile();
  const domains = useCreativeDomains();
  const inputRef = useRef<HTMLInputElement>(null);
  const [offers, setOffers] = useState<OwnOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const registeredSlugs = profile.data?.subdomainSlugs ?? [];
  const registeredKey = registeredSlugs.join('\0');

  /** Resolve names for registered slugs only — the select never lists the full taxonomy. */
  const subdomainGroups = useMemo(() => {
    const allowed = new Set(registeredKey ? registeredKey.split('\0') : []);
    if (!domains.data) return [];
    return domains.data
      .map((domain) => ({
        name: domain.name,
        options: domain.subdomains.filter((s) => allowed.has(s.slug)),
      }))
      .filter((group) => group.options.length > 0);
  }, [domains.data, registeredKey]);

  const activeOffer = editingId ? offers.find((o) => o.id === editingId) : null;
  const showForm = creating || editingId != null;

  useEffect(() => {
    void (async () => {
      try {
        setOffers(await listMine());
      } catch (err) {
        setError(toApiError(err).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setForm({
      ...emptyForm(),
      subdomainSlug: profile.data?.primarySubdomainSlug ?? registeredSlugs[0] ?? '',
    });
    setError(null);
  }

  function startEdit(offer: OwnOffer) {
    setCreating(false);
    setEditingId(offer.id);
    setForm(offerToForm(offer));
    setError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.subdomainSlug) {
      setError('Choose a sub-domain.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (creating) {
        const created = await createOffer(buildWritePayload(form, 'create'));
        setOffers((current) => [...current, created]);
        setCreating(false);
        setEditingId(created.id);
        setForm(offerToForm(created));
      } else if (editingId) {
        const updated = await updateOffer(editingId, buildWritePayload(form, 'update'));
        setOffers((current) => current.map((o) => (o.id === updated.id ? updated : o)));
        setForm(offerToForm(updated));
      }
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveOffer(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteOffer(id);
      setOffers((current) => current.filter((o) => o.id !== id));
      if (editingId === id) cancelForm();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const index = offers.findIndex((o) => o.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= offers.length) return;

    const next = [...offers];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed!);
    setOffers(next);

    try {
      setOffers(await reorderOffers(next.map((o) => o.id)));
    } catch (err) {
      setError(toApiError(err).message);
      setOffers(await listMine());
    }
  }

  async function onAddImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editingId) return;

    const offer = offers.find((o) => o.id === editingId);
    if (!offer) return;
    if (offer.images.length >= OFFER_IMAGE_LIMIT) {
      setError(`An offer can have at most ${OFFER_IMAGE_LIMIT} images`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const [fullBlob, thumbBlob] = await Promise.all([
        resizeImage(file, DISPLAY_EDGE),
        resizeImage(file, THUMB_EDGE),
      ]);
      const ticket = await requestUploadUrl('offer');
      if (ticket.kind !== 'offer') throw new Error('Unexpected upload ticket.');

      await uploadImage(fullBlob, ticket.full.uploadUrl);
      try {
        await uploadImage(thumbBlob, ticket.thumb.uploadUrl);
      } catch (thumbError) {
        await abandonUpload(ticket.full.objectKey);
        throw thumbError;
      }

      const image = await addOfferImage(editingId, {
        objectKey: ticket.full.objectKey,
        thumbKey: ticket.thumb.objectKey,
      });
      setOffers((current) =>
        current.map((o) =>
          o.id === editingId ? { ...o, images: [...o.images, image] } : o,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveImage(imageId: string) {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteOfferImage(imageId);
      setOffers((current) =>
        current.map((o) =>
          o.id === editingId
            ? { ...o, images: o.images.filter((img) => img.id !== imageId) }
            : o,
        ),
      );
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading offers…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {offers.length} of {OFFER_LIMIT} used
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || creating || offers.length >= OFFER_LIMIT || registeredSlugs.length === 0}
          onClick={startCreate}
        >
          Add offer
        </Button>
      </div>

      {registeredSlugs.length === 0 && (
        <p className="text-sm text-ink-muted">
          Save at least one sub-domain on your profile before adding offers.
        </p>
      )}

      {error && <p className="text-sm text-danger-700">{error}</p>}

      {offers.length === 0 && !creating ? (
        <p className="text-sm text-ink-muted">
          No offers yet. Add up to {OFFER_LIMIT}, each with up to {OFFER_IMAGE_LIMIT} images.
        </p>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer, index) => (
            <li
              key={offer.id}
              className="flex flex-col gap-2 border-b border-hairline pb-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{offer.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {offer.subdomainName} ·{' '}
                  {formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
                  {offer.images.length > 0
                    ? ` · ${offer.images.length} image${offer.images.length === 1 ? '' : 's'}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => void move(offer.id, -1)}
                >
                  Move up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === offers.length - 1}
                  onClick={() => void move(offer.id, 1)}
                >
                  Move down
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => startEdit(offer)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onRemoveOffer(offer.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="space-y-4 border border-hairline bg-surface p-4"
          noValidate
        >
          <h4 className="text-base font-medium text-ink">
            {creating ? 'New offer' : 'Edit offer'}
          </h4>

          <Input
            label="Title"
            required
            maxLength={80}
            value={form.title}
            onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
          />

          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Sub-domain
            <select
              required
              className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base"
              value={form.subdomainSlug}
              onChange={(e) => setForm((c) => ({ ...c, subdomainSlug: e.target.value }))}
            >
              <option value="" disabled>
                Choose one
              </option>
              {subdomainGroups.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.options.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="offer-description" className="text-sm font-medium text-ink">
              Description
            </label>
            <textarea
              id="offer-description"
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
              className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="From (₱)"
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              value={form.priceFrom}
              onChange={(e) => setForm((c) => ({ ...c, priceFrom: e.target.value }))}
            />
            <Input
              label="To (₱)"
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              value={form.priceTo}
              onChange={(e) => setForm((c) => ({ ...c, priceTo: e.target.value }))}
            />
          </div>
          <p className="text-xs text-ink-subtle">Leave both blank for Price on request</p>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={busy}>
              {creating ? 'Create offer' : 'Save changes'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={cancelForm}>
              Cancel
            </Button>
          </div>

          {activeOffer && (
            <div className="space-y-3 border-t border-hairline pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-ink-muted">
                  {activeOffer.images.length} of {OFFER_IMAGE_LIMIT} images used
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || activeOffer.images.length >= OFFER_IMAGE_LIMIT}
                  onClick={() => inputRef.current?.click()}
                >
                  {busy ? 'Uploading…' : 'Add image'}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  className="sr-only"
                  onChange={(event) => void onAddImage(event)}
                />
              </div>
              {activeOffer.images.length >= OFFER_IMAGE_LIMIT && (
                <p className="text-sm text-ink-muted">
                  An offer can have at most {OFFER_IMAGE_LIMIT} images.
                </p>
              )}
              {activeOffer.images.length > 0 && (
                <ul className="flex flex-wrap gap-3">
                  {activeOffer.images.map((image) => (
                    <li key={image.id} className="space-y-2">
                      <img
                        src={image.thumbUrl}
                        alt=""
                        width={120}
                        height={120}
                        className="size-28 object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void onRemoveImage(image.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
