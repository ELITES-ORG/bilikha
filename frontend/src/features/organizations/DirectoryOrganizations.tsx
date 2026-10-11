import { Link } from 'react-router-dom';
import { MapPin, Users } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { Message } from '@/i18n/Message';
import { subdomainLabel } from '@/features/taxonomy/format';
import { useOrganizationDirectory } from './api';
import type { OrganizationListParams } from './types';

/**
 * Organisations above the creatives they are made of (plan 0051 step 4.4).
 *
 * A separate, labelled list rather than mixed into the creatives: an
 * organisation is not a person, and a visitor should never contact one
 * thinking it is. Renders nothing until there is something to show — no
 * heading over an empty list, and nothing while it loads, so the creatives
 * below do not jump.
 */
export function DirectoryOrganizations(filters: OrganizationListParams) {
  const organizations = useOrganizationDirectory(filters);
  const rows = organizations.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="directory-organizations" className="mb-10">
      <h2 id="directory-organizations" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Users className="size-4 text-ink-muted" aria-hidden="true" />
        <Message k="organizations.directory.heading" />
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        <Message k="organizations.directory.intro" />
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((organization) => (
          <li key={organization.slug}>
            <Link
              to={`/organizations/${organization.slug}`}
              className="group flex h-full items-center gap-4 rounded-md border border-hairline bg-surface p-4 transition-colors hover:bg-slate-50"
            >
              <Avatar src={organization.logoUrl} name={organization.name} size="md" />
              <span className="min-w-0">
                <span className="block font-semibold break-words text-ink group-hover:text-navy-700">
                  {organization.name}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden />
                    {organization.municipality.name}
                  </span>
                  <span className="inline-flex items-center gap-1" data-numeric>
                    <Users className="size-3.5" aria-hidden />
                    <span className="sr-only">
                      <Message k="organizations.directory.members" />
                    </span>
                    {organization.memberCount}
                  </span>
                </span>
                {organization.primaryCraft && (
                  <Badge tone="brand" className="mt-2">
                    {subdomainLabel(organization.primaryCraft)}
                  </Badge>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
