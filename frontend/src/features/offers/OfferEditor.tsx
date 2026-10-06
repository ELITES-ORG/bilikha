import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { EllipsisVertical, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Input, Select, Textarea, useToast } from '@/components/ui';
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
import { OfferCard, OfferCardSkeleton, offerGridClass } from '@/features/offers/OfferCard';
import { OfferFormDialog } from '@/features/offers/OfferFormDialog';
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
    return (
      <ul className={offerGridClass} aria-label="Loading offers">
        {Array.from({ length: 3 }).map((_, i) => (
          <OfferCardSkeleton key={i} />
        ))}
      </ul>
    );
  }

  const atLimit = offers.length >= OFFER_LIMIT;
  const canAdd =
    !busy && !creating && !reordering && !atLimit && registeredSlugs.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-ink-muted" data-numeric>
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
          size="md"
          className="w-full sm:w-auto"
          iconLeft={<Plus className="size-4" aria-hidden="true" />}
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

      {error && !showForm && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}

      {offers.length === 0 && !creating ? (
        <EmptyState
          title="No offers yet"
          description="Clients cannot hire what they cannot see priced."
          action={
            <Button
              type="button"
              size="sm"
              iconLeft={<Plus className="size-4" aria-hidden="true" />}
              disabled={!canAdd}
              onClick={startCreate}
            >
              Add offer
            </Button>
          }
        />
      ) : reordering ? (
        // Ordering is a list task: compact rows with Up and Down, not cards.
        <ul className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-surface">
          {offers.map((offer, index) => {
            const thumb = offer.images[0]?.thumbUrl;
            return (
              <li key={offer.id} className="flex items-center gap-3 px-4 py-3">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    width={56}
                    height={42}
                    className="aspect-4/3 w-14 shrink-0 rounded-xs object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="aspect-4/3 w-14 shrink-0 rounded-xs bg-primary-soft" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{offer.title}</p>
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
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className={offerGridClass}>
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              image={offer.images[0] ?? null}
              title={offer.title}
              description={offer.description}
              category={offer.subdomainName}
              price={formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
              footer={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    iconLeft={<Pencil className="size-4" aria-hidden="true" />}
                    disabled={busy}
                    onClick={() => {
                      setMenuOpenId(null);
                      startEdit(offer);
                    }}
                  >
                    Edit
                  </Button>
                  <div className="relative shrink-0">
                    <button
                      ref={menuOpenId === offer.id ? menuTriggerRef : undefined}
                      type="button"
                      className={cn(
                        'inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors pointer-fine:size-9',
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
                        className="absolute right-0 bottom-full z-10 mb-1 w-40 rounded-sm border border-hairline bg-surface py-1 shadow-md"
                      >
                        <button
                          ref={menuItemRef}
                          type="button"
                          role="menuitem"
                          className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium text-danger-700 hover:bg-danger-50 pointer-fine:min-h-9"
                          disabled={busy}
                          onClick={() => {
                            setMenuOpenId(null);
                            void onRemoveOffer(offer.id);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </>
              }
            />
          ))}
        </ul>
      )}

      <OfferFormDialog
        open={showForm}
        title={creating ? 'New offer' : 'Edit offer'}
        busy={busy}
        onClose={cancelForm}
      >
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            {error && (
              <p
                className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
                role="alert"
              >
                {error}
              </p>
            )}

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

            <Textarea
              id="offer-description"
              label="Description"
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            />

            <div>
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
              <p className="mt-2 text-xs text-ink-subtle">Leave both blank for Price on request</p>
            </div>

            {activeOffer && (
              <section className="space-y-3 border-t border-hairline pt-5" aria-label="Images">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">Images</p>
                    <p className="text-xs text-ink-muted" data-numeric>
                      {activeOffer.images.length} of {OFFER_IMAGE_LIMIT} images used
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    iconLeft={<ImagePlus className="size-4" aria-hidden="true" />}
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
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {activeOffer.images.map((image, index) => (
                      <li key={image.id} className="space-y-1.5">
                        <img
                          src={image.thumbUrl}
                          alt={`${activeOffer.title}, image ${index + 1}`}
                          width={160}
                          height={120}
                          className="aspect-4/3 w-full rounded-sm object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-full"
                          disabled={busy}
                          onClick={() => void onRemoveImage(image.id)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-hairline px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={cancelForm}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={busy}>
              {creating ? 'Create offer' : 'Save changes'}
            </Button>
          </div>
        </form>
      </OfferFormDialog>
    </div>
  );
}
