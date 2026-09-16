import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, useToast } from '@/components/ui';
import { authKeys } from '@/features/auth/api';
import { confirmAvatar, removeAvatar, requestUploadUrl, uploadImage } from '@/features/media/api';
import { THUMB_EDGE, resizeImage } from '@/lib/image';
import { toApiError } from '@/lib/api-client';

interface AvatarUploaderProps {
  name: string;
  avatarUrl: string | null;
}

/** resizeImage throws plain Errors; everything else is an API failure. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : toApiError(error).message;
}

export function AvatarUploader({ name, avatarUrl }: AvatarUploaderProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshUser() {
    await queryClient.invalidateQueries({ queryKey: authKeys.me });
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);

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
          setPreviewUrl(URL.createObjectURL(blob));
          await refreshUser();
        },
        { success: 'Photo updated', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await toast.run(
        'Removing photo…',
        async () => {
          await removeAvatar();
          setPreviewUrl(null);
          await refreshUser();
        },
        { success: 'Photo removed', error: describe },
      );
    } catch {
      // Already reported in the toast.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <Avatar src={previewUrl} name={name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Profile photo</p>
        <p className="mt-1 text-sm text-ink-muted">
          A square-ish headshot works best. Photos are resized on your device
          before upload.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Working…' : previewUrl ? 'Replace photo' : 'Add photo'}
          </Button>
          {previewUrl && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-danger-700">{error}</p>}
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
