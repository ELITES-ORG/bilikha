import { useEffect, useRef, useState } from 'react';
import { Clock, Download, Play, X } from 'lucide-react';
import type { ConversationAttachment } from '@contracts/conversations';
import { Button, Skeleton } from '@/components/ui';
import '@/i18n/catalogs/messages';
import { useT } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { KIND_ICONS } from './kind-icons';
import { asDownload, isExpiredError, useAttachmentThumb, useFileUrl } from './api';
import { expiredSentence, fileFacts, untilSentence } from './message-files';

/**
 * A message's files in the thread (ADR 0060). Opening the thread fetches
 * thumbnails and posters only; a file itself is fetched when someone taps it,
 * through a URL that lasts minutes. Nothing plays by itself. A file past its
 * 30 days is a line saying what was there and when it went.
 */

type Tone = 'self' | 'other';

const CARD: Readonly<Record<Tone, string>> = {
  self: 'border-primary/40 bg-primary-active/40 text-on-primary',
  other: 'border-hairline bg-slate-50 text-ink',
};

const MUTED: Readonly<Record<Tone, string>> = {
  self: 'text-on-primary-muted',
  other: 'text-ink-muted',
};

function ExpiredLine({ file, tone }: { file: ConversationAttachment; tone: Tone }) {
  const t = useT();
  const Icon = KIND_ICONS[file.kind];
  return (
    <p className={cn('flex items-center gap-2 rounded-sm border border-dashed px-3 py-2 text-sm', CARD[tone])}>
      <Icon className={cn('size-4 shrink-0', MUTED[tone])} aria-hidden="true" />
      <span className="text-pretty">{expiredSentence(file, t)}</span>
    </p>
  );
}

/** One photo: its thumbnail, which opens the full photo. */
function PhotoTile({
  conversationId,
  file,
  tone,
  onOpen,
  onExpired,
}: {
  conversationId: string;
  file: ConversationAttachment;
  tone: Tone;
  onOpen: (button: HTMLButtonElement) => void;
  onExpired: () => void;
}) {
  const t = useT();
  const thumb = useAttachmentThumb(conversationId, file.id, file.hasThumb);
  const expired = isExpiredError(thumb.error);

  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  if (thumb.isError && !expired) {
    return <p className={cn('rounded-sm border px-3 py-2 text-sm', CARD[tone])}>{t('messages.files.unavailable')}</p>;
  }
  return (
    <button
      type="button"
      className="block aspect-square w-full overflow-hidden rounded-sm bg-surface-sunken"
      aria-label={t('messages.files.viewPhoto')}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      {thumb.data ? (
        <img src={thumb.data.url} alt="" className="size-full object-cover" decoding="async" />
      ) : (
        <Skeleton className="size-full" />
      )}
    </button>
  );
}

/** "Video · 42 MB · 2:10" beside its icon, on a line of its own so it never wraps mid-figure. */
function Facts({ file, tone }: { file: ConversationAttachment; tone: Tone }) {
  const t = useT();
  const Icon = KIND_ICONS[file.kind];
  return (
    <p className="flex items-center gap-2 text-sm" data-numeric>
      <Icon className={cn('size-4 shrink-0', MUTED[tone])} aria-hidden="true" />
      <span className="min-w-0">{fileFacts(file, t)}</span>
    </p>
  );
}

/** Audio or video: what it costs to play, then a player once it is tapped. */
function MediaRow({
  conversationId,
  file,
  tone,
  url,
  onPlay,
  onDownload,
  busy,
}: {
  conversationId: string;
  file: ConversationAttachment;
  tone: Tone;
  url: string | null;
  onPlay: () => void;
  onDownload: () => void;
  busy: boolean;
}) {
  const t = useT();
  const poster = useAttachmentThumb(conversationId, file.id, file.kind === 'video' && file.hasThumb);
  const player = useRef<HTMLMediaElement | null>(null);

  // The tap that fetched the URL is the one that asked to play it.
  useEffect(() => {
    if (url) void player.current?.play().catch(() => undefined);
  }, [url]);

  return (
    <div className={cn('space-y-2 rounded-sm border p-2.5', CARD[tone])}>
      {url && file.kind === 'video' && (
        <video
          ref={(element) => {
            player.current = element;
          }}
          controls
          preload="none"
          playsInline
          poster={poster.data?.url}
          src={url}
          className="aspect-video w-full rounded-xs bg-surface-sunken object-contain short:aspect-auto short:h-40"
        />
      )}
      {url && file.kind === 'audio' && (
        <audio
          ref={(element) => {
            player.current = element;
          }}
          controls
          preload="none"
          src={url}
          className="w-full"
        />
      )}
      {!url && poster.data && (
        <button
          type="button"
          className="relative block aspect-video w-full overflow-hidden rounded-xs bg-surface-sunken"
          aria-label={t('messages.files.play')}
          onClick={onPlay}
        >
          <img src={poster.data.url} alt="" className="size-full object-cover" decoding="async" />
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-scrim/60 text-on-primary">
              <Play className="size-6" />
            </span>
          </span>
        </button>
      )}
      <Facts file={file} tone={tone} />
      <div className="flex flex-wrap items-center gap-2">
        {!url && (
          <Button
            type="button"
            size="sm"
            variant={tone === 'self' ? 'inverse' : 'secondary'}
            iconLeft={<Play className="size-4" aria-hidden="true" />}
            loading={busy}
            onClick={onPlay}
          >
            {t('messages.files.play')}
          </Button>
        )}
        <DownloadButton tone={tone} onClick={onDownload} />
      </div>
    </div>
  );
}

function DownloadButton({ tone, onClick }: { tone: Tone; onClick: () => void }) {
  const t = useT();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={tone === 'self' ? 'text-on-primary hover:bg-primary-active' : undefined}
      iconLeft={<Download className="size-4" aria-hidden="true" />}
      onClick={onClick}
    >
      {t('messages.files.download')}
    </Button>
  );
}

/** The full photo, in a modal dialog: Escape closes it and focus returns to the thumbnail. */
function PhotoViewer({ url, onClose, onDownload }: { url: string | null; onClose: () => void; onDownload: () => void }) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (url) {
      if (!dialog.open) dialog.showModal();
      queueMicrotask(() => closeRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
  }, [url]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('messages.files.kind.image')}
      className="m-auto max-h-[min(92vh,56rem)] w-[min(100%-1.5rem,48rem)] border-0 bg-transparent p-0 backdrop:bg-scrim/70"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      {url && (
        <div className="flex flex-col gap-3 rounded-md bg-paper p-3 shadow-xl sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <DownloadButton tone="other" onClick={onDownload} />
            <button
              ref={closeRef}
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-slate-100 hover:text-ink"
              aria-label={t('messages.files.closePhoto')}
              onClick={onClose}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <img src={url} alt="" className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" />
        </div>
      )}
    </dialog>
  );
}

export function MessageFiles({
  conversationId,
  files = [],
  fromSelf,
}: {
  conversationId: string;
  /** Missing from an API that predates files in messages: then there are none. */
  files?: readonly ConversationAttachment[];
  fromSelf: boolean;
}) {
  const t = useT();
  const tone: Tone = fromSelf ? 'self' : 'other';
  const fileUrl = useFileUrl(conversationId);
  // Files the API answered 410 for since the thread was read: expired while the page was open.
  const [lapsed, setLapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [playing, setPlaying] = useState<Readonly<Record<string, string>>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  if (files.length === 0) return null;

  const isGone = (file: ConversationAttachment) => file.expired || lapsed.has(file.id);
  const markGone = (id: string) =>
    setLapsed((current) => (current.has(id) ? current : new Set([...current, id])));

  /** Fetches a file's URL for one tap, turning a 410 into the expired line. */
  async function withUrl(id: string, then: (url: string) => void) {
    setError(null);
    setLoading(id);
    try {
      then((await fileUrl(id)).url);
    } catch (failure) {
      if (isExpiredError(failure)) markGone(id);
      else setError(t('messages.files.unavailable'));
    } finally {
      setLoading(null);
    }
  }

  const download = (id: string) => void withUrl(id, (url) => window.location.assign(asDownload(url)));

  /** Opens a PDF in a new tab, opened before the URL is fetched so no pop-up blocker stops it. */
  function openPdf(id: string) {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    let opened = false;
    void withUrl(id, (url) => {
      opened = true;
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    }).then(() => {
      // No URL came: close the blank tab rather than leave it behind.
      if (tab && !opened) tab.close();
    });
  }

  const photos = files.filter((file) => file.kind === 'image');
  const others = files.filter((file) => file.kind !== 'image');
  const until = files.find((file) => !isGone(file) && file.expiresAt);

  return (
    <div className="mb-2 space-y-2">
      {photos.some((file) => !isGone(file)) && (
        <ul className={cn('grid gap-1.5', photos.length === 1 ? 'w-56 max-w-full grid-cols-1' : 'w-64 max-w-full grid-cols-2')}>
          {photos
            .filter((file) => !isGone(file))
            .map((file) => (
              <li key={file.id}>
                <PhotoTile
                  conversationId={conversationId}
                  file={file}
                  tone={tone}
                  onExpired={() => markGone(file.id)}
                  onOpen={(button) => {
                    trigger.current = button;
                    void withUrl(file.id, (url) => setViewer({ id: file.id, url }));
                  }}
                />
              </li>
            ))}
        </ul>
      )}
      {photos.filter(isGone).map((file) => (
        <ExpiredLine key={file.id} file={file} tone={tone} />
      ))}

      {others.map((file) => {
        if (isGone(file)) return <ExpiredLine key={file.id} file={file} tone={tone} />;
        if (file.kind === 'document') {
          return (
            <div key={file.id} className={cn('space-y-2 rounded-sm border p-2.5', CARD[tone])}>
              <Facts file={file} tone={tone} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={tone === 'self' ? 'inverse' : 'secondary'}
                  loading={loading === file.id}
                  onClick={() => openPdf(file.id)}
                >
                  {t('messages.files.open')}
                </Button>
                <DownloadButton tone={tone} onClick={() => download(file.id)} />
              </div>
            </div>
          );
        }
        return (
          <MediaRow
            key={file.id}
            conversationId={conversationId}
            file={file}
            tone={tone}
            url={playing[file.id] ?? null}
            busy={loading === file.id}
            onPlay={() => void withUrl(file.id, (url) => setPlaying((current) => ({ ...current, [file.id]: url })))}
            onDownload={() => download(file.id)}
          />
        );
      })}

      {until && (
        <p className={cn('flex items-center gap-1.5 text-xs', MUTED[tone])}>
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          {untilSentence(until, t)}
        </p>
      )}
      {error && (
        <p className={cn('text-xs', tone === 'self' ? 'text-on-primary' : 'text-danger-700')} role="alert">
          {error}
        </p>
      )}

      <PhotoViewer
        url={viewer?.url ?? null}
        onClose={() => {
          setViewer(null);
          queueMicrotask(() => trigger.current?.focus());
        }}
        onDownload={() => viewer && download(viewer.id)}
      />
    </div>
  );
}
