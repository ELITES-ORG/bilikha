import { useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Container,
  EmptyState,
  Eyebrow,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import { relativeTime } from '@/features/conversations/relative-time';
import {
  useAdminTaxonomy,
  useArchiveTaxonomyItem,
  useCreateDomain,
  useCreateSubdomain,
  useDeleteTaxonomyItem,
  useTaxonomyChanges,
  useUpdateTaxonomyItem,
  type AdminTaxonomyDomain,
  type AdminTaxonomySubdomain,
  type TaxonomyKind,
} from '@/features/admin/taxonomy-api';
import { toApiError } from '@/lib/api-client';
import { canDelete, referencesLabel, reorderWrites } from './taxonomy-page-logic';

/**
 * The taxonomy editor (plan 0047 phase 4, ADR 0049).
 *
 * Three rules shape this screen rather than the usual CRUD table:
 *
 * 1. **Archiving is the primary action, deletion is the exception.** A
 *    sub-domain that any profile, offer or posting points at is archived, never
 *    deleted — the reference has to keep resolving. Delete is only offered at a
 *    reference count of zero, and says so.
 * 2. **Archived items stay visible.** Hiding them would leave an administrator
 *    no way to find what they archived in order to restore it.
 * 3. **Slugs are not editable.** A slug is in URLs and shared into Messenger,
 *    so changing one is a migration and a redirect, not an edit. There is no
 *    field for it here and the server refuses one.
 */
export function AdminTaxonomyPage() {
  const taxonomy = useAdminTaxonomy();
  const [addingDomain, setAddingDomain] = useState(false);

  return (
    <Container width="wide" className="py-(--section-gap)">
      <Eyebrow>Administration</Eyebrow>
      <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Taxonomy</h1>
      <p className="mt-3 max-w-xl text-md text-ink-muted">
        The nine domains and their crafts. The database is the source of truth, so an edit here
        survives a deploy. Archiving hides an item from pickers while every profile that already
        names it keeps working — it is the reversible option, and almost always the right one.
      </p>

      <div className="mt-10 space-y-4">
        {taxonomy.isPending && (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        )}

        {taxonomy.isError && (
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not load the taxonomy"
            description={taxonomy.error.message}
          />
        )}

        {taxonomy.data?.map((domain) => <DomainRow key={domain.id} domain={domain} />)}

        {taxonomy.data && taxonomy.data.length === 0 && (
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="No domains"
            description="The seed loads the nine domains RA 11904 defines. If this is empty, the seed has not run."
          />
        )}
      </div>

      {taxonomy.data && (
        <div className="mt-6">
          {addingDomain ? (
            <CreateDomainForm onDone={() => setAddingDomain(false)} />
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => setAddingDomain(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add a domain
            </Button>
          )}
        </div>
      )}

      <ChangeLog />
    </Container>
  );
}

/** One domain, collapsed to its name until opened. */
function DomainRow({ domain }: { domain: AdminTaxonomyDomain }) {
  const [open, setOpen] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const archived = domain.archivedAt !== null;

  return (
    <Card elevation="flat" as="section">
      <CardBody className="space-y-4">
        {/* Stacked on a phone: sharing one row squeezes the domain name into
            two lines behind the Archive button. Side by side from `sm`. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="u-tap flex min-h-11 items-start gap-2 text-left sm:flex-1"
          >
            {open ? (
              <ChevronDown className="mt-1 size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            ) : (
              <ChevronRight className="mt-1 size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            )}
            <span>
              <span className="u-display block text-xl text-ink">{domain.name}</span>
              <span className="block text-xs text-ink-subtle">
                {domain.slug} · {domain.subdomains.length} crafts ·{' '}
                {referencesLabel(domain.referenceCount)}
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {archived && <ArchivedBadge />}
            <ItemActions kind="domains" item={domain} craftCount={domain.subdomains.length} />
          </div>
        </div>

        {open && (
          <div className="space-y-3 border-t border-hairline pt-4">
            <EditForm kind="domains" slug={domain.slug} name={domain.name} />

            {domain.subdomains.length === 0 ? (
              <p className="text-sm text-ink-subtle">No crafts in this domain yet.</p>
            ) : (
              <ul className="space-y-2">
                {domain.subdomains.map((sub, index) => (
                  <SubdomainRow
                    key={sub.id}
                    subdomain={sub}
                    siblings={domain.subdomains}
                    index={index}
                  />
                ))}
              </ul>
            )}

            {addingChild ? (
              <CreateSubdomainForm
                domainSlug={domain.slug}
                onDone={() => setAddingChild(false)}
              />
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setAddingChild(true)}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add a craft
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SubdomainRow({
  subdomain,
  siblings,
  index,
}: {
  subdomain: AdminTaxonomySubdomain;
  siblings: AdminTaxonomySubdomain[];
  index: number;
}) {
  const [editing, setEditing] = useState(false);
  const archived = subdomain.archivedAt !== null;

  return (
    <li className="rounded-sm border border-hairline bg-clay-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base text-ink">{subdomain.name}</p>
          <p className="text-xs text-ink-subtle">
            {subdomain.slug} · {referencesLabel(subdomain.referenceCount)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {archived && <ArchivedBadge />}
          <Reorder subdomain={subdomain} siblings={siblings} index={index} />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? 'Close' : 'Rename'}
          </Button>
          <ItemActions kind="subdomains" item={subdomain} />
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-hairline pt-3">
          <EditForm kind="subdomains" slug={subdomain.slug} name={subdomain.name} />
        </div>
      )}
    </li>
  );
}

/**
 * A move renumbers the crafts 1…n in their new order and writes only the ones
 * whose number changed (`reorderWrites`) — two requests on a well-numbered
 * list. The server updates one item at a time, so a failure part-way leaves a
 * tie or a gap; renumbering from the list's own order repairs it on the next
 * press, where swapping two equal values would move nothing.
 */
function Reorder({
  subdomain,
  siblings,
  index,
}: {
  subdomain: AdminTaxonomySubdomain;
  siblings: AdminTaxonomySubdomain[];
  index: number;
}) {
  const toast = useToast();
  const update = useUpdateTaxonomyItem();

  async function swap(direction: -1 | 1) {
    const writes = reorderWrites(siblings, index, direction);
    if (writes.length === 0) return;

    try {
      await toast.run(
        'Reordering…',
        async () => {
          // One at a time: each is an audited write, and a failure stops the
          // rest rather than leaving several half-applied.
          for (const write of writes) {
            await update.mutateAsync({ kind: 'subdomains', ...write });
          }
        },
        { success: 'Order saved', error: (error) => toApiError(error).message },
      );
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <span className="flex items-center">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={index === 0 || update.isPending}
        onClick={() => void swap(-1)}
        aria-label={`Move ${subdomain.name} up`}
      >
        <ChevronUp className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={index === siblings.length - 1 || update.isPending}
        onClick={() => void swap(1)}
        aria-label={`Move ${subdomain.name} down`}
      >
        <ChevronDown className="size-4" aria-hidden="true" />
      </Button>
    </span>
  );
}

/**
 * Archive, restore, and — only at a reference count of zero — delete.
 *
 * Delete is a two-step confirmation in place rather than a dialog: a modal
 * would sit above the toasts that report the result (DESIGN.md).
 */
function ItemActions({
  kind,
  item,
  craftCount = 0,
}: {
  kind: TaxonomyKind;
  item: { slug: string; name: string; archivedAt: string | null; referenceCount: number };
  /** A domain's crafts, which a delete removes with it (`ON DELETE CASCADE`). */
  craftCount?: number;
}) {
  const toast = useToast();
  const archive = useArchiveTaxonomyItem();
  const remove = useDeleteTaxonomyItem();
  const [confirming, setConfirming] = useState(false);
  const archived = item.archivedAt !== null;
  const deletable = canDelete(item);

  async function setArchived(action: 'archive' | 'restore') {
    try {
      await toast.run(
        action === 'archive' ? 'Archiving…' : 'Restoring…',
        () => archive.mutateAsync({ kind, slug: item.slug, action }),
        {
          success: action === 'archive' ? `${item.name} archived` : `${item.name} restored`,
          error: (error) => toApiError(error).message,
        },
      );
    } catch {
      // Already reported in the toast.
    }
  }

  async function destroy() {
    try {
      await toast.run(
        'Deleting…',
        () => remove.mutateAsync({ kind, slug: item.slug }),
        { success: `${item.name} deleted`, error: (error) => toApiError(error).message },
      );
      setConfirming(false);
    } catch {
      // Already reported in the toast; the row stays so the count can be read.
    }
  }

  if (confirming) {
    return (
      <div className="w-full space-y-2 rounded-sm border border-hairline bg-clay-50 p-3">
        <p className="text-sm text-ink">
          Delete <strong className="font-semibold">{item.name}</strong> permanently
          {craftCount > 0 && (
            <>
              , and its {craftCount} {craftCount === 1 ? 'craft' : 'crafts'} with it
            </>
          )}
          ? This cannot be undone. Archiving is the reversible option and keeps the record.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={remove.isPending}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            loading={remove.isPending}
            onClick={() => void destroy()}
          >
            Delete permanently
          </Button>
        </div>
      </div>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={archived ? 'secondary' : 'ghost'}
        loading={archive.isPending}
        onClick={() => void setArchived(archived ? 'restore' : 'archive')}
      >
        {archived ? (
          <>
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore
          </>
        ) : (
          <>
            <Archive className="size-4" aria-hidden="true" />
            Archive
          </>
        )}
      </Button>

      {deletable && (
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete
        </Button>
      )}
    </span>
  );
}

function ArchivedBadge() {
  return (
    <Badge tone="warning" icon={<Archive className="size-3" />}>
      Archived
    </Badge>
  );
}

/** Rename only. There is deliberately no slug field — see the page comment. */
function EditForm({ kind, slug, name }: { kind: TaxonomyKind; slug: string; name: string }) {
  const toast = useToast();
  const update = useUpdateTaxonomyItem();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const next = value.trim();

    if (next.length < 2) {
      setError('A name is at least 2 characters.');
      return;
    }
    if (next === name) {
      setError('That is the current name.');
      return;
    }

    try {
      await toast.run(
        'Renaming…',
        () => update.mutateAsync({ kind, slug, name: next }),
        { success: 'Name saved', error: (err) => toApiError(err).message },
      );
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  return (
    /* Stacked on a phone. Side by side, the hint wraps to two lines and the
       button bottom-aligns against the wrap instead of the field. */
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="min-w-0 sm:flex-1">
        <Input
          label="Name"
          hint={`The slug stays ${slug} — it is in URLs and cannot change.`}
          maxLength={120}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error ?? undefined}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="sm:mt-7"
        loading={update.isPending}
        onClick={() => void submit()}
      >
        Save
      </Button>
    </div>
  );
}

function CreateDomainForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const create = useCreateDomain();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await toast.run(
        'Adding the domain…',
        () => create.mutateAsync({ slug: slug.trim(), name: name.trim() }),
        { success: 'Domain added', error: (err) => toApiError(err).message },
      );
      onDone();
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  return (
    <Card elevation="flat">
      <CardBody className="space-y-3">
        <h2 className="u-display text-xl text-ink">Add a domain</h2>
        <p className="text-sm text-ink-muted">
          RA 11904 defines nine. Adding a tenth is a decision about the law's scope, not a label
          fix — archive and replace a wrong one instead.
        </p>
        <Input
          label="Name"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label="Slug"
          hint="Lowercase letters, digits and single hyphens. Chosen once — it cannot be changed."
          maxLength={64}
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          error={error ?? undefined}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" loading={create.isPending} onClick={() => void submit()}>
            Add domain
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function CreateSubdomainForm({
  domainSlug,
  onDone,
}: {
  domainSlug: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const create = useCreateSubdomain();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await toast.run(
        'Adding the craft…',
        () => create.mutateAsync({ domainSlug, slug: slug.trim(), name: name.trim() }),
        { success: 'Craft added', error: (err) => toApiError(err).message },
      );
      onDone();
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  return (
    <div className="space-y-3 rounded-sm border border-hairline bg-clay-50 p-3">
      <Input
        label="Name"
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label="Slug"
        hint="Lowercase letters, digits and single hyphens, spelled out. Chosen once."
        maxLength={64}
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        error={error ?? undefined}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={create.isPending} onClick={() => void submit()}>
          Add craft
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The audit trail. Append-only and keyed on the slug as text, so a deleted
 * item's history outlives it — which is the point of recording it at all.
 */
function ChangeLog() {
  const [page, setPage] = useState(1);
  const changes = useTaxonomyChanges(page);
  const total = changes.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <section className="mt-(--section-gap)">
      <h2 className="u-display text-2xl text-ink">Recent changes</h2>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Every edit, with who made it. Newest first.
      </p>

      <div className="mt-4 space-y-2">
        {changes.isPending && <Skeleton className="h-28 w-full" />}

        {changes.isError && (
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not load the history"
            description={changes.error.message}
          />
        )}

        {changes.data?.data.length === 0 && (
          <EmptyState
            icon={<CircleCheck className="size-5" />}
            title="Nothing changed yet"
            description="The taxonomy is as the seed loaded it."
          />
        )}

        {changes.data?.data.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded-sm border border-hairline p-3"
          >
            <p className="text-sm text-ink">
              <span className="font-semibold">{entry.adminUsername ?? 'a deleted account'}</span>{' '}
              {entry.action} the {entry.itemKind}{' '}
              <span className="text-ink-muted">{entry.itemSlug}</span>
            </p>
            <p className="text-xs text-ink-subtle">
              <time dateTime={entry.createdAt}>{relativeTime(entry.createdAt)}</time>
            </p>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Newer
          </Button>
          <span className="text-sm text-ink-muted">
            Page {page} of {pages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Older
          </Button>
        </div>
      )}
    </section>
  );
}
