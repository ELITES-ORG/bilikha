import { useRef, type ChangeEvent } from 'react';
import { Avatar, Button, useToast } from '@/components/ui';
import { useRemoveLogo, useSetLogo } from '@/features/organizations/logo-api';
import type { ManagedOrganization } from '@/features/organizations/types';
import { useT } from '@/i18n/i18n-context';
import '@/i18n/catalogs/organizations';
import { Message } from '@/i18n/Message';
import { toApiError } from '@/lib/api-client';

/** resizeImage throws plain Errors; everything else is an API failure. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : toApiError(error).message;
}

/**
 * The organisation's logo, for the founder and co-founders. Shown wherever the
 * initials are now — the page and the directory card. The image is resized on
 * the device before it uploads, as a profile photo is, because a phone camera
 * file is several megabytes on metered data (constraint 3).
 */
export function LogoSection({ organization }: { organization: ManagedOrganization }) {
  const t = useT();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const setLogo = useSetLogo(organization.slug);
  const removeLogo = useRemoveLogo(organization.slug);
  const busy = setLogo.isPending || removeLogo.isPending;

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await toast.run(t('organizations.manage.logo.uploading'), () => setLogo.mutateAsync(file), {
        success: t('organizations.manage.logo.updated'),
        error: describe,
      });
    } catch {
      // Already reported in the toast.
    }
  }

  async function onRemove() {
    try {
      await toast.run(t('organizations.manage.logo.removing'), () => removeLogo.mutateAsync(), {
        success: t('organizations.manage.logo.removed'),
        error: describe,
      });
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <section className="mt-(--section-gap)" aria-labelledby="logo-heading">
      <h2 id="logo-heading" className="u-display text-2xl text-ink">
        <Message k="organizations.manage.logo.heading" />
      </h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <Avatar src={organization.logoUrl} name={organization.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted">
            <Message k="organizations.manage.logo.intro" />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Message
                k={
                  busy
                    ? 'organizations.manage.logo.working'
                    : organization.logoUrl
                      ? 'organizations.manage.logo.replace'
                      : 'organizations.manage.logo.add'
                }
              />
            </Button>
            {organization.logoUrl && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
                <Message k="organizations.manage.logo.remove" />
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
    </section>
  );
}
