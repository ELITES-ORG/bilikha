import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, MessageSquare, Settings2, Users } from 'lucide-react';
import { CornerBlob } from '@/components/Decor';
import { BackPill, ShareButton } from '@/components/PageCornerActions';
import { ProfileSkeleton } from '@/components/page-skeleton/parts';
import { Avatar, Badge, Button, ButtonLink, Card, CardBody, Container } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { ContactComposer } from '@/features/conversations/ContactComposer';
import {
  OrganizationNotFoundError,
  useMyOrganizations,
  useOrganization,
} from '@/features/organizations/api';
import { ROLE_LABEL, canManage } from '@/features/organizations/labels';
import { useT } from '@/i18n/i18n-context';
import '@/i18n/catalogs/organizations';
import { Message } from '@/i18n/Message';
import { pbBottomNav } from '@/lib/bottom-nav';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { subdomainLabel } from '@/features/taxonomy/format';

/**
 * An organisation's public page — a team of creatives (ADR 0054, plan 0051).
 *
 * Laid out like a creative's profile on purpose: the same cover band, the same
 * identity block, so a visitor reads it as the same kind of thing. The members
 * are the substance — each links to the person's own profile, which is where
 * their own work is. Only members whose own profile is public are shown; the
 * API enforces that, not this page.
 *
 * Messaging the organisation is an ordinary conversation with the founder
 * alone (ADR 0054) — the same composer as a creative's page, addressed to the
 * founder's profile, and saying so, so nobody thinks the whole team reads it.
 */
export function OrganizationPage() {
  const t = useT();
  const { slug } = useParams<{ slug: string }>();
  const organization = useOrganization(slug);
  const { data: user } = useCurrentUser();
  const mine = useMyOrganizations(Boolean(user));
  const [composerOpen, setComposerOpen] = useState(false);

  if (organization.isError && organization.error instanceof OrganizationNotFoundError) {
    return <NotFoundPage />;
  }

  const data = organization.data;
  const myRole = mine.data?.find((o) => o.slug === slug)?.role;
  const founder = data?.members.find((m) => m.role === 'founder');
  // A member reaches the team some other way; the founder has no one to message.
  const canMessage = Boolean(founder) && !myRole;

  return (
    <main className={pbBottomNav}>
      <Container width="wide" className="py-6 sm:py-10">
        {organization.isPending && <ProfileSkeleton band="organisation" />}
        {organization.isError && <p className="text-danger-700">{organization.error.message}</p>}

        {data && (
          <>
            <div className="relative h-32 overflow-hidden rounded-lg bg-primary sm:h-44 lg:h-56 short:h-24">
              <CornerBlob placement="top-right" onNavy />
              <CornerBlob placement="bottom-left" onNavy className="opacity-70" />
              <div className="absolute top-3 left-3">
                <BackPill />
              </div>
              <div className="absolute top-3 right-3">
                <ShareButton title={data.name} label={t('organizations.page.share')} />
              </div>
            </div>

            <div className="relative -mt-14 flex flex-col items-center text-center sm:-mt-16 lg:flex-row lg:items-start lg:justify-between lg:px-8 lg:text-left">
              <div className="flex flex-col items-center lg:flex-row lg:items-start lg:gap-6">
                <span className="rounded-full bg-paper p-1 shadow-sm">
                  <Avatar src={data.logoUrl} name={data.name} size="xl" />
                </span>
                <div className="mt-4 lg:mt-0 lg:pt-18">
                  <h1 className="u-display text-3xl break-words text-ink sm:text-4xl">{data.name}</h1>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-muted">
                    <Users className="size-4" aria-hidden="true" />
                    <Message k="organizations.page.kind" />
                  </p>
                </div>
              </div>
              {canMessage && !composerOpen && (
                <div className="mt-5 w-full sm:w-auto lg:mt-0 lg:pt-18">
                  {user ? (
                    <Button
                      size="lg"
                      fullWidth
                      className="sm:w-auto"
                      iconLeft={<MessageSquare className="size-4" aria-hidden="true" />}
                      onClick={() => setComposerOpen(true)}
                    >
                      <Message k="organizations.page.message" />
                    </Button>
                  ) : (
                    <ButtonLink
                      to={`/login?next=${encodeURIComponent(`/organizations/${data.slug}`)}`}
                      size="lg"
                      fullWidth
                      className="sm:w-auto"
                      iconLeft={<MessageSquare className="size-4" aria-hidden="true" />}
                    >
                      <Message k="organizations.page.signInToMessage" />
                    </ButtonLink>
                  )}
                </div>
              )}
              {canManage(myRole) && (
                <div className="mt-5 w-full sm:w-auto lg:mt-0 lg:pt-18">
                  <ButtonLink
                    to={`/organizations/${data.slug}/manage`}
                    variant="secondary"
                    size="lg"
                    fullWidth
                    className="sm:w-auto"
                    iconLeft={<Settings2 className="size-4" aria-hidden="true" />}
                  >
                    <Message k="organizations.page.manage" />
                  </ButtonLink>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col items-center text-center lg:items-start lg:px-8 lg:text-left">
              {data.crafts.length > 0 && (
                <p className="font-semibold text-ink">{data.crafts.map((c) => subdomainLabel(c)).join(' · ')}</p>
              )}
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-muted">
                <MapPin className="size-4 text-red-500" aria-hidden="true" />
                {data.municipality.name}, Biliran
              </p>
            </div>

            {user && composerOpen && founder && (
              <div className="mt-8 lg:px-8">
                <p className="mb-3 text-sm text-ink-muted">
                  <Message k="organizations.page.messageNote" /> {founder.displayName}
                </p>
                <ContactComposer
                  profileSlug={founder.profileSlug}
                  creativeName={founder.displayName}
                  onCancel={() => setComposerOpen(false)}
                />
              </div>
            )}

            {data.bio && (
              <p className="mx-auto mt-8 max-w-2xl text-md whitespace-pre-line text-ink-muted lg:mx-0 lg:px-8">
                {data.bio}
              </p>
            )}

            <section className="mt-10 lg:px-8" aria-labelledby="members-heading">
              <h2 id="members-heading" className="u-display text-2xl text-ink">
                <Message k="organizations.page.team" />
              </h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.members.map((member) => (
                  <li key={member.profileSlug}>
                    <Card elevation="flat" className="relative h-full">
                      <CardBody className="flex items-center gap-4">
                        <Avatar src={member.avatarUrl} name={member.displayName} size="md" />
                        <div className="min-w-0">
                          <Link
                            to={`/creatives/${member.profileSlug}`}
                            className="font-medium break-words text-ink after:absolute after:inset-0"
                          >
                            {member.displayName}
                          </Link>
                          {member.title && (
                            <p className="text-sm break-words text-ink-muted">{member.title}</p>
                          )}
                          {member.role !== 'member' && (
                            <p className="mt-1">
                              <Badge tone="neutral">
                                <Message k={ROLE_LABEL[member.role]} />
                              </Badge>
                            </p>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </Container>
    </main>
  );
}
