import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Film, ImagePlus, Music, Plus, X } from 'lucide-react';
import type { MediaKind } from '@contracts/media';
import { Button, useToast } from '@/components/ui';
import { abandonUpload, requestUploadUrl, uploadImage } from '@/features/media/api';
import { checkBeforeUpload, classifyFile, formatBytes, formatDuration } from '@/features/media/checks';
import {
  abandonUploadTicket,
  attachOfferMedia,
  mediaKeys,
  requestUploadTicket,
  useMediaLimits,
  useMediaUsage,
} from '@/features/media/limits-api';
import { readDuration, videoCodec } from '@/features/media/probe';
import { isAbort, transferFile } from '@/features/media/transfer';
import { initialUploadState, uploadReducer, type UploadEvent, type UploadState } from '@/features/media/upload-machine';
import '@/i18n/catalogs/offers';
import type { MessageKey } from '@/i18n/catalogs/en';
import { fill } from '@/i18n/fill';
import { useT } from '@/i18n/i18n-context';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { DISPLAY_EDGE, THUMB_EDGE, resizeImage } from '@/lib/image';
import { addOfferImage, deleteOfferImage, type OwnOffer } from './api';
import { offerImageLimit } from './limits';
import {
  acceptAttribute,
  acceptsOnlyImages,
  isFull,
  itemsForOffer,
  refusalMessage,
  uploadFailureMessage,
  type OfferEditorItem,
  type UploadStage,
} from './media-uploader-logic';

interface Upload {
  key: number;
  name: string;
  state: UploadState;
}

const KIND_LABELS: Readonly<Record<MediaKind, MessageKey>> = {
  image: 'offers.media.kind.image',
  audio: 'offers.media.kind.audio',
  video: 'offers.media.kind.video',
  document: 'offers.media.kind.document',
};

const KIND_ICONS = { audio: Music, video: Film, document: FileText } as const;

/** The file name without its extension, as a first title the creative can recognise. */
function titleFrom(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  const title = (dot > 0 ? name.slice(0, dot) : name).trim().slice(0, 120).trim();
  return title || undefined;
}

/** resizeImage throws plain Errors; everything else is an API failure. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : toApiError(error).message;
}

/**
 * An offer's photos, audio, video and PDFs in the editor (ADR 0046): the
 * limits up front, each picked file checked before a byte is sent, then sent
 * straight to storage with its progress shown, and attached. Uploads run side
 * by side. Against an API without the upload pipeline it adds images only,
 * the way the editor always has.
 */
export function MediaUploader({ offer, onChanged }: { offer: OwnOffer; onChanged: () => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const limitsState = useMediaLimits();
  const usage = useMediaUsage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const nextKey = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const reservations = useRef(new Map<number, string>());

  const limits = limitsState.available ? limitsState.limits : null;
  const loadingLimits = !limitsState.available && limitsState.loading;
  const legacy = !limitsState.available && !limitsState.loading;
  const imagesOnly = acceptsOnlyImages(limits);
  const items = itemsForOffer(offer);
  const images = items.filter((item) => item.kind === 'image');
  const others = items.filter((item) => item.kind !== 'image');
  const keptImages = images.filter((item) => item.state !== 'pending_remove').length;
  const imageLimit = offerImageLimit(limitsState);

  useEffect(() => {
    if (uploads.length === 0) return;
    const warning = t('offers.media.leaveWarning');
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = warning;
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [uploads.length, t]);

  // Closing the editor stops what it started; each upload then gives its reservation back.
  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
    };
  }, []);

  function send(key: number, event: UploadEvent) {
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, state: uploadReducer(upload.state, event) } : upload)),
    );
  }

  function finish(key: number) {
    controllers.current.delete(key);
    reservations.current.delete(key);
    setUploads((current) => current.filter((upload) => upload.key !== key));
  }

  function cancel(key: number) {
    send(key, { type: 'cancel' });
    controllers.current.get(key)?.abort();
  }

  async function upload(file: File, kind: MediaKind, durationSeconds: number | null) {
    const key = nextKey.current++;
    const controller = new AbortController();
    const { signal } = controller;
    controllers.current.set(key, controller);
    setUploads((current) => [...current, { key, name: file.name, state: initialUploadState }]);

    let stage: UploadStage = kind === 'image' ? 'preparing' : 'sending';
    try {
      const reservationId = await transferFile(file, kind, durationSeconds, {
        requestTicket: (body) => requestUploadTicket({ destination: 'offer', offerId: offer.id, ...body }),
        onEvent: (event) => {
          if (event.type === 'prepared') stage = 'sending';
          else if (event.type === 'ticket') reservations.current.set(key, event.reservationId);
          else send(key, event);
        },
        signal,
      });

      send(key, { type: 'transferred' });
      await attachOfferMedia(offer.id, {
        reservationId,
        ...(kind === 'image' ? {} : { title: titleFrom(file.name) }),
      });
      reservations.current.delete(key);
      send(key, { type: 'confirmed' });
      await onChanged();
      void queryClient.invalidateQueries({ queryKey: mediaKeys.usage() });
    } catch (error) {
      const reservationId = reservations.current.get(key);
      if (reservationId) void abandonUploadTicket(reservationId).catch(() => undefined);
      if (!isAbort(error) && !signal.aborted) setNotice(uploadFailureMessage(error, stage, t));
    } finally {
      finish(key);
    }
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice(null);

    if (legacy) {
      await onAddImageLegacy(file);
      return;
    }
    if (!limits) return;

    const kind = classifyFile(file);
    const limit = kind ? limits.destinations.offer[kind] : null;
    if (!kind || !limit?.enabled) {
      setNotice(refusalMessage('type', { imagesOnly }, t));
      return;
    }
    const timed = kind === 'audio' || kind === 'video';
    const durationSeconds = timed ? await readDuration(file) : null;
    const codec = kind === 'video' ? await videoCodec(file) : null;
    const check = checkBeforeUpload(file, kind, limit, { durationSeconds, codec });
    if (!check.ok) {
      setNotice(refusalMessage(check.reason, { sizeBytes: file.size, durationSeconds, limit: check.limit, imagesOnly }, t));
      return;
    }
    if (isFull(offer, kind, limits)) {
      setNotice(refusalMessage('MEDIA_LIMIT_REACHED', {}, t));
      return;
    }
    await upload(file, kind, durationSeconds);
  }

  /** The editor's image upload from before ADR 0046, for an API that has no upload pipeline. */
  async function onAddImageLegacy(file: File) {
    if (keptImages >= imageLimit) {
      setNotice(`An offer can have at most ${imageLimit} images`);
      return;
    }

    setBusy(true);
    setNotice(null);
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

      await addOfferImage(offer.id, {
        objectKey: ticket.full.objectKey,
        thumbKey: ticket.thumb.objectKey,
      });
      // The server decides whether the photo is simply part of the offer or
      // waits for review with a change (ADR 0058), so read it back.
      await onChanged();
      }, { success: offer.status === 'published' ? 'Image sent for review' : 'Image added', error: describe });
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setRemovingId(id);
    setNotice(null);
    try {
      await deleteOfferImage(id);
      await onChanged();
      void queryClient.invalidateQueries({ queryKey: mediaKeys.usage() });
    } catch (error) {
      setNotice(describe(error));
    } finally {
      setRemovingId(null);
    }
  }

  const stateLabel = (item: OfferEditorItem) =>
    item.stateLabel && <p className="text-xs font-medium text-warning-700">{t(item.stateLabel)}</p>;

  return (
    <section className="space-y-3 border-t border-hairline pt-5" aria-labelledby="offer-media-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p id="offer-media-heading" className="text-sm font-semibold text-ink">
            {t('offers.media.heading')}
          </p>
          <p className="text-xs text-pretty text-ink-muted" data-numeric>
            {imagesOnly ? t('offers.media.limitsImagesOnly') : t('offers.media.limits')}
          </p>
          {usage.data && (
            <p className="text-xs text-ink-muted" data-numeric>
              {fill(t('offers.media.quota'), {
                used: formatBytes(usage.data.usedBytes),
                total: formatBytes(usage.data.quotaBytes),
              })}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          iconLeft={
            imagesOnly ? (
              <ImagePlus className="size-4" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )
          }
          disabled={busy || loadingLimits}
          onClick={() => inputRef.current?.click()}
        >
          {imagesOnly ? t('offers.media.addImage') : t('offers.media.add')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(limits)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void onPick(event)}
        />
      </div>

      <p className="text-xs text-pretty text-ink-muted">
        {t('offers.media.rights')}{' '}
        <Link to="/terms" className="link-underline u-tap text-navy-700">
          {t('offers.media.rightsLink')}
        </Link>
      </p>

      {notice && (
        <p className="text-sm text-danger-700" role="alert">
          {notice}
        </p>
      )}

      <ul className="space-y-2" aria-live="polite">
        {uploads.map((item) => {
          const progress = item.state.status === 'uploading' ? item.state : null;
          const fraction = progress ? (progress.total > 0 ? progress.sent / progress.total : 0) : item.state.status === 'confirming' ? 1 : 0;
          return (
            <li key={item.key} className="space-y-2 rounded-sm border border-hairline px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words text-ink">
                    {fill(t('offers.media.uploading'), { name: item.name })}
                  </p>
                  {progress && (
                    <p className="text-xs text-ink-muted" data-numeric>
                      {fill(t('offers.media.progress'), {
                        sent: formatBytes(progress.sent),
                        total: formatBytes(progress.total),
                        percent: String(Math.floor(fraction * 100)),
                      })}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  iconLeft={<X className="size-4" aria-hidden="true" />}
                  disabled={item.state.status === 'confirming'}
                  onClick={() => cancel(item.key)}
                >
                  {t('offers.media.cancel')}
                </Button>
              </div>
              <div className="h-1 overflow-hidden bg-slate-100" aria-hidden="true">
                <div
                  className="h-full origin-left bg-primary transition-transform duration-150"
                  style={{ transform: `scaleX(${fraction})` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((item, index) => (
            <li key={item.id} className="space-y-1.5">
              <img
                src={item.image.thumbUrl}
                alt={`${offer.title}, image ${index + 1}`}
                width={160}
                height={120}
                className={cn(
                  'aspect-4/3 w-full rounded-sm object-cover',
                  item.state === 'pending_remove' && 'opacity-40',
                )}
                loading="lazy"
                decoding="async"
              />
              {stateLabel(item)}
              {item.state !== 'pending_remove' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  disabled={busy || removingId !== null}
                  onClick={() => void onRemove(item.id)}
                >
                  {t('offers.media.remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-sm border border-hairline">
          {others.map((item) => {
            const Icon = KIND_ICONS[item.kind];
            const { media } = item;
            return (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className={cn('flex min-w-0 flex-1 items-center gap-3', item.state === 'pending_remove' && 'opacity-40')}>
                  <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words text-ink">
                      {media.title ?? t('offers.media.untitled')}
                    </p>
                    <p className="text-xs text-ink-muted" data-numeric>
                      {[
                        t(KIND_LABELS[item.kind]),
                        formatBytes(media.sizeBytes),
                        ...(media.durationSeconds !== null ? [formatDuration(media.durationSeconds)] : []),
                      ].join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {stateLabel(item)}
                  {item.state !== 'pending_remove' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || removingId !== null}
                      onClick={() => void onRemove(item.id)}
                    >
                      {t('offers.media.remove')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
