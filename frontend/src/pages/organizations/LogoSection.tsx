import { useRef, type ChangeEvent } from 'react';
import { Avatar, Badge, Button, useToast } from '@/components/ui';
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
 *
 * A new logo waits for an administrator (ADR 0058). The team sees it here,
 * marked as waiting; everyone else keeps seeing the approved logo, or initials,
 * until it is approved.
 */
export function LogoSection({ organization }: { organization: ManagedOrganization }) {
  const t = useT();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const setLogo = useSetLogo(organization.slug);
  const removeLogo = useRemoveLogo(organization.slug);
  const busy = setLogo.isPending || removeLogo.isPending;

  // Older API responses carry neither field; read them as nothing waiting.
  const pending = organization.pendingLogoUrl ?? null;
  const rejectionReason = organization.logoRejectionReason ?? null;
  const shown = pending ?? organization.logoUrl;

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await toast.run(t('organizations.manage.logo.uploading'), () => setLogo.mutateAsync(file), {
        success: t('organizations.manage.logo.sent'),
        error: describe,
      });
    } catch {
      // Already reported in the toast.
    }
  }

  async function onRemove() {
    const withdrawing = Boolean(pending);
    try {
      await toast.run(
        t(withdrawing ? 'organizations.manage.logo.withdrawing' : 'organizations.manage.logo.removing'),
        () => removeLogo.mutateAsync(),
        {
          success: t(withdrawing ? 'organizations.manage.logo.withdrawn' : 'organizations.manage.logo.removed'),
          error: describe,
        },
      );
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
        <Avatar src={shown} name={organization.name} size="lg" />
        <div className="min-w-0 flex-1">
          {pending ? (
            <div role="status">
              <Badge tone="warning">
                <Message k="organizations.manage.logo.pending" />
              </Badge>
              <p className="mt-1.5 text-sm text-ink-muted">
                <Message
                  k={
                    organization.logoUrl
                      ? 'organizations.manage.logo.pendingKeepsOld'
                      : 'organizations.manage.logo.pendingNoOld'
                  }
                />
              </p>
            </div>
          ) : rejectionReason ? (
            <div role="status">
              <Badge tone="danger">
                <Message k="organizations.manage.logo.rejected" />
              </Badge>
              {/* The reason is the administrator's own words, shown as written. */}
              <p className="mt-1.5 text-sm text-ink-muted">
                {rejectionReason}
                {organization.logoUrl && (
                  <>
                    {' '}
                    <Message k="organizations.manage.logo.rejectedKeepsOld" />
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              <Message k="organizations.manage.logo.intro" />
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
              <Message
                k={
                  busy
                    ? 'organizations.manage.logo.working'
                    : shown
                      ? 'organizations.manage.logo.replace'
                      : 'organizations.manage.logo.add'
                }
              />
            </Button>
            {shown && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
                <Message
                  k={pending ? 'organizations.manage.logo.withdraw' : 'organizations.manage.logo.remove'}
                />
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
