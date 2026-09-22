import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ChevronRight, EllipsisVertical } from 'lucide-react';
import { Button, Input, Select, useToast } from '@/components/ui';
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
import { PesoInput } from '@/features/offers/PesoInput';
import { useCreativeDomains } from '@/features/taxonomy/api';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { DISPLAY_EDGE, THUMB_EDGE, resizeImage } from '@/lib/image';
import { centavosToPesoInput, formatPriceRange, pesoInputToCentavos } from '@/lib/money';

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

function offerToForm(offer: OwnOffer): FormState {
  return {
    title: offer.title,
    subdomainSlug: offer.subdomainSlug,
    description: offer.description ?? '',
    priceFrom: centavosToPesoInput(offer.priceMinCentavos),
    priceTo: centavosToPesoInput(offer.priceMaxCentavos),
  };
}

function buildWritePayload(form: FormState, mode: 'create' | 'update') {
  const min = pesoInputToCentavos(form.priceFrom);
  const max = pesoInputToCentavos(form.priceTo);
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

/** resizeImage throws plain Errors; everything else is an API failure. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : toApiError(error).message;
}

export function OfferEditor() {
  const toast = useToast();
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
  /** Which row's overflow is open — destructive actions stay out of the primary row. */
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  /** Reorder is a mode entered once — pairwise Move buttons do not sit on every row. */
  const [reordering, setReordering] = useState(false);

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

  // Overflow claims role="menu" — dismiss on outside click / Escape, and move
  // focus into the item on open so the role is not a lie.
  useEffect(() => {
    if (!menuOpenId) return;

    menuItemRef.current?.focus();

    function onDismiss(event: Event) {
      const target = event.target as Node;
      if (menuPanelRef.current?.contains(target)) return;
      if (menuTriggerRef.current?.contains(target)) return;
      setMenuOpenId(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpenId(null);
        menuTriggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        menuItemRef.current?.focus();
      }
    }

    // pointerdown for real taps; click as well because programmatic .click()
    // (and some assistive paths) never synthesise a pointer event.
    document.addEventListener('pointerdown', onDismiss);
    document.addEventListener('click', onDismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDismiss);
      document.removeEventListener('click', onDismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpenId]);

  function startCreate() {
    setReordering(false);
    setMenuOpenId(null);
    setCreating(true);
    setEditingId(null);
    setForm({
      ...emptyForm(),
      subdomainSlug: profile.data?.primarySubdomainSlug ?? registeredSlugs[0] ?? '',
    });
    setError(null);
  }

  function startEdit(offer: OwnOffer) {
    setReordering(false);
    setMenuOpenId(null);
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
      await toast.run(
        creating ? 'Creating offer…' : 'Saving changes…',
        async () => {
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
        },
        { success: creating ? 'Offer created' : 'Changes saved', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveOffer(id: string) {
    setBusy(true);
    setError(null);
    try {
      await toast.run(
        'Deleting offer…',
        async () => {
          await deleteOffer(id);
          setOffers((current) => current.filter((o) => o.id !== id));
          if (editingId === id) cancelForm();
        },
        { success: 'Offer deleted', error: describe },
      );
    } catch {
      // Already reported in the toast.
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

    // No pending toast: the list has already moved optimistically, so the only
    // thing worth saying is that it failed and has been put back.
    try {
      setOffers(await reorderOffers(next.map((o) => o.id)));
    } catch (err) {
      toast.error(describe(err));
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
      await toast.run('Uploading image…', async () => {
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
      }, { success: 'Image added', error: describe });
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveImage(imageId: string) {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      await toast.run(
        'Removing image…',
        async () => {
          await deleteOfferImage(imageId);
          setOffers((current) =>
            current.map((o) =>
              o.id === editingId
                ? { ...o, images: o.images.filter((img) => img.id !== imageId) }
                : o,
            ),
          );
        },
        { success: 'Image removed', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading offers…</p>;
  }

  const atLimit = offers.length >= OFFER_LIMIT;
  const canAdd =
    !busy && !creating && !reordering && !atLimit && registeredSlugs.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm text-ink-muted">
            {offers.length} of {OFFER_LIMIT} used
          </p>
          {offers.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || creating || showForm}
              onClick={() => {
                setMenuOpenId(null);
                setReordering((current) => !current);
              }}
            >
              {reordering ? 'Done reordering' : 'Reorder'}
            </Button>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canAdd}
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
          Clients cannot hire what they cannot see priced.
        </p>
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {offers.map((offer, index) => {
            const thumb = offer.images[0]?.thumbUrl;
            return (
              <li key={offer.id} className="flex items-start gap-3 py-3">
                {reordering ? (
                  <>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        width={56}
                        height={56}
                        className="size-14 shrink-0 object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="size-14 shrink-0 bg-clay-100" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{offer.title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={index === 0 || busy}
                        onClick={() => void move(offer.id, -1)}
                      >
                        Up
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={index === offers.length - 1 || busy}
                        onClick={() => void move(offer.id, 1)}
                      >
                        Down
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-3 text-left',
                        'transition-opacity',
                        busy && 'pointer-events-none opacity-60',
                      )}
                      disabled={busy}
                      onClick={() => {
                        setMenuOpenId(null);
                        startEdit(offer);
                      }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          width={56}
                          height={56}
                          className="size-14 shrink-0 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="size-14 shrink-0 bg-clay-100" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {offer.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {offer.subdomainName}
                        </span>
                        <span className="mt-0.5 block text-sm font-medium text-ink">
                          {formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    </button>
                    <div className="relative shrink-0">
                      <button
                        ref={menuOpenId === offer.id ? menuTriggerRef : undefined}
                        type="button"
                        className={cn(
                          'inline-flex size-9 items-center justify-center rounded-sm text-ink-muted',
                          'hover:bg-clay-100 hover:text-ink',
                        )}
                        aria-label={`More actions for ${offer.title}`}
                        aria-expanded={menuOpenId === offer.id}
                        aria-haspopup="menu"
                        aria-controls={
                          menuOpenId === offer.id ? `offer-overflow-${offer.id}` : undefined
                        }
                        disabled={busy}
                        onClick={() =>
                          setMenuOpenId((current) => (current === offer.id ? null : offer.id))
                        }
                      >
                        <EllipsisVertical className="size-4" aria-hidden />
                      </button>
                      {menuOpenId === offer.id && (
                        <div
                          ref={menuPanelRef}
                          id={`offer-overflow-${offer.id}`}
                          role="menu"
                          className="absolute right-0 z-10 mt-1 w-40 rounded-sm border border-hairline bg-surface py-1 shadow-sm"
                        >
                          <button
                            ref={menuItemRef}
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-2 text-left text-sm text-danger-700 hover:bg-clay-50"
                            disabled={busy}
                            onClick={() => {
                              setMenuOpenId(null);
                              void onRemoveOffer(offer.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
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

          <Select
            label="Sub-domain"
            required
            value={form.subdomainSlug}
            placeholder="Choose one"
            onValueChange={(subdomainSlug) => setForm((c) => ({ ...c, subdomainSlug }))}
            groups={subdomainGroups.map((group) => ({
              label: group.name,
              options: group.options.map((option) => ({
                value: option.slug,
                label: option.name,
              })),
            }))}
          />

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
            <PesoInput
              label="From (₱)"
              value={form.priceFrom}
              onValueChange={(priceFrom) => setForm((c) => ({ ...c, priceFrom }))}
            />
            <PesoInput
              label="To (₱)"
              value={form.priceTo}
              onValueChange={(priceTo) => setForm((c) => ({ ...c, priceTo }))}
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
