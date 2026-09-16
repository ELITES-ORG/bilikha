import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button, Input } from '@/components/ui';
import {
  createPortfolioItem,
  deletePortfolioItem,
  listOwnPortfolio,
  reorderPortfolio,
  requestUploadUrl,
  updatePortfolioCaption,
  uploadImage,
  abandonUpload,
  type PortfolioItem,
} from '@/features/media/api';
import { DISPLAY_EDGE, THUMB_EDGE, resizeImage } from '@/lib/image';
import { toApiError } from '@/lib/api-client';

const LIMIT = 10;

export function PortfolioEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setItems(await listOwnPortfolio());
      } catch (err) {
        setError(toApiError(err).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onAdd(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const [fullBlob, thumbBlob] = await Promise.all([
        resizeImage(file, DISPLAY_EDGE),
        resizeImage(file, THUMB_EDGE),
      ]);
      const ticket = await requestUploadUrl('portfolio');
      if (ticket.kind !== 'portfolio') throw new Error('Unexpected upload ticket.');

      await uploadImage(fullBlob, ticket.full.uploadUrl);

      try {
        await uploadImage(thumbBlob, ticket.thumb.uploadUrl);
      } catch (thumbError) {
        await abandonUpload(ticket.full.objectKey);
        throw thumbError;
      }

      const created = await createPortfolioItem({
        objectKey: ticket.full.objectKey,
        thumbKey: ticket.thumb.objectKey,
      });
      setItems((current) => [...current, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCaptionBlur(id: string, caption: string) {
    try {
      const updated = await updatePortfolioCaption(id, caption.trim() || null);
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deletePortfolioItem(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const index = items.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;

    const next = [...items];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed!);
    setItems(next);

    try {
      const saved = await reorderPortfolio(next.map((item) => item.id));
      setItems(saved);
    } catch (err) {
      setError(toApiError(err).message);
      setItems(await listOwnPortfolio());
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading portfolio…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {items.length} of {LIMIT} used
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || items.length >= LIMIT}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : 'Add image'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          onChange={(event) => void onAdd(event)}
        />
      </div>

      {error && <p className="text-sm text-danger-700">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">No images yet. Add up to ten.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item, index) => (
            <li key={item.id} className="flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row">
              <img
                src={item.thumbUrl}
                alt={item.caption ?? ''}
                width={120}
                height={120}
                className="size-28 shrink-0 object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  label="Caption"
                  defaultValue={item.caption ?? ''}
                  onBlur={(event) => void onCaptionBlur(item.id, event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => void move(item.id, -1)}
                  >
                    Move left
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === items.length - 1}
                    onClick={() => void move(item.id, 1)}
                  >
                    Move right
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onRemove(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
