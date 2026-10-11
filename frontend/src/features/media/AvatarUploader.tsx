import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, useToast } from '@/components/ui';
import { authKeys } from '@/features/auth/api';
import { confirmAvatar, removeAvatar, requestUploadUrl, uploadImage } from '@/features/media/api';
import { THUMB_EDGE, resizeImage } from '@/lib/image';
import { toApiError } from '@/lib/api-client';

interface AvatarUploaderProps {
  name: string;
  /** The approved photo: what everyone else sees. */
  avatarUrl: string | null;
  /** A new photo waiting for review, seen only by its owner (ADR 0058). */
  pendingAvatarUrl?: string | null;
  /** Why the last new photo was not approved. */
  rejectionReason?: string | null;
}

/** resizeImage throws plain Errors; everything else is an API failure. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : toApiError(error).message;
}

/**
 * The account's photo. A new one waits for an administrator before anyone else
 * sees it (ADR 0058); until then its owner sees it here, marked as waiting, and
 * everyone else keeps seeing the approved photo, or initials.
 */
export function AvatarUploader({ name, avatarUrl, pendingAvatarUrl = null, rejectionReason = null }: AvatarUploaderProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // Shown straight after an upload, before the account reloads.
  const [justUploaded, setJustUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = justUploaded ?? pendingAvatarUrl;
  const shown = pending ?? avatarUrl;

  async function refreshUser() {
    await queryClient.invalidateQueries({ queryKey: authKeys.me });
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      await toast.run(
        'Uploading photo…',
        async () => {
          const blob = await resizeImage(file, THUMB_EDGE);
          const ticket = await requestUploadUrl('avatar');
          if (ticket.kind !== 'avatar') {
            throw new Error('Unexpected upload ticket.');
          }
          await uploadImage(blob, ticket.uploadUrl);
          await confirmAvatar(ticket.objectKey);
          setJustUploaded(URL.createObjectURL(blob));
          await refreshUser();
        },
        { success: 'Photo sent for review', error: describe },
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
        withdrawing ? 'Withdrawing photo…' : 'Removing photo…',
        async () => {
          await removeAvatar();
          setJustUploaded(null);
          await refreshUser();
        },
        { success: withdrawing ? 'New photo withdrawn' : 'Photo removed', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <Avatar src={shown} name={name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Profile photo</p>
        {pending ? (
          <div className="mt-1.5" role="status">
            <Badge tone="warning">Waiting for review</Badge>
            <p className="mt-1.5 text-sm text-ink-muted">
              {avatarUrl
                ? 'Others see your previous photo until an administrator approves this one.'
                : 'Others see your initials until an administrator approves it.'}
            </p>
          </div>
        ) : rejectionReason ? (
          <div className="mt-1.5" role="status">
            <Badge tone="danger">New photo not approved</Badge>
            <p className="mt-1.5 text-sm text-ink-muted">
              {rejectionReason}
              {avatarUrl ? ' Your approved photo is still showing.' : ''}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            A square-ish headshot works best. Photos are resized on your device
            before upload, and an administrator looks at each new one.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Working…' : shown ? 'Replace photo' : 'Add photo'}
          </Button>
          {shown && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
              {pending ? 'Withdraw new photo' : 'Remove'}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          onChange={onFileChange}
        />
      </div>
    </div>
  );
}
