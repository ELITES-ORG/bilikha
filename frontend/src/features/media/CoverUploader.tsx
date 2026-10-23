import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, useToast } from '@/components/ui';
import { abandonUpload, confirmCover, removeCover, requestUploadUrl, uploadImage } from '@/features/media/api';
import { meKeys } from '@/features/me/api';
import type { ProfileCover } from '@/features/me/types';
import { profileKeys } from '@/features/profiles/api';
import { profileBandClass, profileBandFrameClass } from '@/features/profiles/profile-band';
import { resizeCover } from '@/lib/image';
import { toApiError } from '@/lib/api-client';
import { useVerificationGate } from '@/features/verification/useVerificationGate';

interface CoverUploaderProps {
  /** The approved cover: what everyone else sees. Undefined from an API before covers. */
  cover?: ProfileCover | null;
  /** A new cover waiting for review, seen only by its owner (ADR 0058). */
  pendingCover?: ProfileCover | null;
  /** Why the last new cover was not approved. */
  rejectionReason?: string | null;
}

/** resizeCover throws plain Errors; everything else is an API failure. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : toApiError(error).message;
}

/** Best-effort: anything left behind is removed by media:prune. */
async function abandon(...objectKeys: string[]) {
  await Promise.all(objectKeys.map((key) => abandonUpload(key).catch(() => undefined)));
}

/**
 * The profile's cover, the band at the top of the profile page (issue #36,
 * ADR 0061). Like the photo, a new one waits for an administrator before anyone
 * else sees it; until then its owner sees it here, marked as waiting, and
 * everyone else keeps seeing the approved cover, or the navy band.
 */
export function CoverUploader({ cover = null, pendingCover = null, rejectionReason = null }: CoverUploaderProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // Shown straight after an upload, before the profile reloads.
  const [justUploaded, setJustUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Uploads other than the ID itself wait for a verified ID (ADR 0057). The
  // photo uploader just above says why, so the note is not repeated here.
  const { browseOnly } = useVerificationGate();

  const pending = justUploaded ?? pendingCover?.smallUrl ?? null;
  const shown = pending ?? cover?.smallUrl ?? null;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: meKeys.profile() }),
      queryClient.invalidateQueries({ queryKey: profileKeys.all }),
    ]);
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      await toast.run(
        'Uploading cover…',
        async () => {
          const { full, small } = await resizeCover(file);
          const ticket = await requestUploadUrl('cover');
          if (ticket.kind !== 'cover') {
            throw new Error('Unexpected upload ticket.');
          }
          await uploadImage(full, ticket.full.uploadUrl);
          try {
            await uploadImage(small, ticket.small.uploadUrl);
          } catch (error) {
            await abandon(ticket.full.objectKey);
            throw error;
          }
          try {
            await confirmCover(ticket.full.objectKey, ticket.small.objectKey);
          } catch (error) {
            // A cover the confirm did record is kept: abandon refuses a file in use.
            await abandon(ticket.full.objectKey, ticket.small.objectKey);
            throw error;
          }
          setJustUploaded(URL.createObjectURL(small));
          await refresh();
        },
        { success: 'Cover sent for review', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    const withdrawing = Boolean(pending);
    setBusy(true);
    try {
      await toast.run(
        withdrawing ? 'Withdrawing cover…' : 'Removing cover…',
        async () => {
          await removeCover();
          setJustUploaded(null);
          await refresh();
        },
        { success: withdrawing ? 'New cover withdrawn' : 'Cover removed', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  return (
    // Set apart from the profile photo just above it.
    <div className="space-y-3 pt-4">
      {/* The profile page's band, so the crop is the one the public will see. */}
      <div className={profileBandFrameClass}>
        <div className={profileBandClass}>
          {shown && <img src={shown} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Cover photo</p>
        {pending ? (
          <div className="mt-1.5" role="status">
            <Badge tone="warning">Waiting for review</Badge>
            <p className="mt-1.5 text-sm text-ink-muted">
              {cover
                ? 'Others see your previous cover until an administrator approves this one.'
                : 'Others see the navy band until an administrator approves it.'}
            </p>
          </div>
        ) : rejectionReason ? (
          <div className="mt-1.5" role="status">
            <Badge tone="danger">New cover not approved</Badge>
            <p className="mt-1.5 text-sm text-ink-muted">
              {rejectionReason}
              {cover ? ' Your approved cover is still showing.' : ''}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            A wide landscape photo works best. Only the middle strip shows — the top and bottom are cropped on
            most screens. At least 1200 × 400 pixels.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || browseOnly}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Working…' : shown ? 'Replace cover' : 'Add cover'}
          </Button>
          {shown && (
            <Button type="button" size="sm" variant="ghost" disabled={busy || browseOnly} onClick={onRemove}>
              {pending ? 'Withdraw new cover' : 'Remove'}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFileChange}
        />
      </div>
    </div>
  );
}
