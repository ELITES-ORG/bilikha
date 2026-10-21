import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { formatBytes } from '@/features/media/checks';
import '@/i18n/catalogs/messages';
import { fill } from '@/i18n/fill';
import { useT } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { KIND_ICONS } from './kind-icons';
import { limitsSentence, type MessageFileLimits } from './message-files';
import type { MessageUploads, PendingFile } from './use-message-uploads';

/**
 * The composer's files (ADR 0060). The paperclip opens a tray that says what
 * can be sent and for how long it is kept before anything is picked; picked
 * files show their progress there until the message goes.
 */

export function AttachToggle({ open, onToggle, count }: { open: boolean; onToggle: () => void; count: number }) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center self-end rounded-sm text-ink-muted hover:bg-slate-100 hover:text-ink',
        open && 'bg-slate-100 text-ink',
      )}
      aria-label={open ? t('messages.files.closeTray') : t('messages.files.attach')}
      aria-expanded={open}
      aria-controls="message-files-tray"
      onClick={onToggle}
    >
      <Paperclip className="size-5" aria-hidden="true" />
      {count > 0 && (
        <Badge tone="accent" variant="solid" className="absolute -top-0.5 -right-0.5 px-1.5 tabular-nums" aria-hidden="true">
          {count}
        </Badge>
      )}
    </button>
  );
}

function PendingRow({ file, onRemove }: { file: PendingFile; onRemove: () => void }) {
  const t = useT();
  const Icon = KIND_ICONS[file.kind];
  const { state } = file;
  const progress = state.status === 'uploading' ? state : null;
  const fraction = progress ? (progress.total > 0 ? progress.sent / progress.total : 0) : state.status === 'confirming' ? 1 : 0;
  const ready = state.status === 'confirming';
  const label = ready
    ? fill(t('messages.files.ready'), { name: file.name })
    : fill(t(progress ? 'messages.files.uploading' : 'messages.files.preparing'), { name: file.name });

  return (
    <li className="space-y-1.5 rounded-sm border border-hairline bg-surface px-3 py-2">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words text-ink">{label}</p>
          {progress && (
            <p className="text-xs text-ink-muted" data-numeric>
              {fill(t('messages.files.progress'), {
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
          onClick={onRemove}
        >
          {ready ? t('messages.files.remove') : t('messages.files.cancel')}
        </Button>
      </div>
      {!ready && (
        <div className="h-1 overflow-hidden bg-slate-100" aria-hidden="true">
          <div
            className="h-full origin-left bg-primary transition-transform duration-150"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      )}
    </li>
  );
}

export function AttachTray({
  limits,
  uploads,
  onClose,
}: {
  limits: MessageFileLimits;
  uploads: MessageUploads;
  onClose: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const full = uploads.files.length >= limits.filesPerMessage;
  const ready = uploads.files.filter((file) => file.state.status === 'confirming');
  const latestReady = ready[ready.length - 1];

  return (
    <div id="message-files-tray" className="mb-2 space-y-2 rounded-md border border-hairline bg-surface-sunken p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs text-pretty text-ink-muted" data-numeric>
            {limitsSentence(limits, t)}
          </p>
          <p className="text-xs text-pretty text-ink-muted">{t('messages.files.kept')}</p>
        </div>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-slate-100 hover:text-ink"
          aria-label={t('messages.files.closeTray')}
          onClick={onClose}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {uploads.notice && (
        <p className="text-sm text-danger-700" role="alert">
          {uploads.notice}
        </p>
      )}

      {uploads.files.length > 0 && (
        <ul className="max-h-48 space-y-2 overflow-y-auto short:max-h-28">
          {uploads.files.map((file) => (
            <PendingRow key={file.key} file={file} onRemove={() => uploads.remove(file.key)} />
          ))}
        </ul>
      )}
      {/* Says a file is ready once, not each progress tick: the list above is not a live region. */}
      <p role="status" className="sr-only">
        {latestReady ? fill(t('messages.files.ready'), { name: latestReady.name }) : ''}
      </p>

      {!full && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            iconLeft={<Paperclip className="size-4" aria-hidden="true" />}
            onClick={() => inputRef.current?.click()}
          >
            {t('messages.files.choose')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={limits.accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              event.target.value = '';
              void uploads.add(picked);
            }}
          />
        </>
      )}
    </div>
  );
}
