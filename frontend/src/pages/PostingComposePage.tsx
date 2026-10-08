import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { Info } from 'lucide-react';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { PesoInput } from '@/features/offers/PesoInput';
import {
  PostingNotFoundError,
  useCreatePosting,
  usePosting,
  useUpdatePosting,
} from '@/features/postings/api';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import { centavosToPesoInput, pesoInputToCentavos } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function PostingComposePage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const existing = usePosting(isEdit ? id : undefined);
  const create = useCreatePosting();
  const update = useUpdatePosting(id ?? '');
  const domains = useCreativeDomains();
  const municipalities = useMunicipalities();

  const [title, setTitle] = useState('');
  const [domainSlug, setDomainSlug] = useState('');
  const [subdomainSlug, setSubdomainSlug] = useState('');
  const [municipalitySlug, setMunicipalitySlug] = useState('');
  const [description, setDescription] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [hydrated, setHydrated] = useState(!isEdit);

  const selectedDomain = useMemo(
    () => domains.data?.find((d) => d.slug === domainSlug),
    [domains.data, domainSlug],
  );

  useEffect(() => {
    if (!isEdit || !existing.data || hydrated) return;
    const row = existing.data;
    setTitle(row.title);
    setDomainSlug(
      domains.data?.find((d) => d.subdomains.some((s) => s.slug === row.subdomain.slug))?.slug ?? '',
    );
    setSubdomainSlug(row.subdomain.slug);
    setMunicipalitySlug(row.municipality.slug);
    setDescription(row.description ?? '');
    setBudgetMin(centavosToPesoInput(row.budgetMinCentavos));
    setBudgetMax(centavosToPesoInput(row.budgetMaxCentavos));
    setHydrated(true);
  }, [isEdit, existing.data, domains.data, hydrated]);

  if (isEdit && existing.isError && existing.error instanceof PostingNotFoundError) {
    return <NotFoundPage />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // The form is noValidate now that the sub-domain and municipality controls
    // are listboxes rather than native selects, so the browser no longer
    // enforces any of this.
    if (title.trim().length < 3) {
      toast.error('Give the posting a title of at least 3 characters.');
      return;
    }
    if (!subdomainSlug) {
      toast.error('Choose a sub-domain so the right creatives see this.');
      return;
    }
    if (!municipalitySlug) {
      toast.error('Choose the municipality where the work is.');
      return;
    }

    const min = pesoInputToCentavos(budgetMin);
    const max = pesoInputToCentavos(budgetMax);
    if (min != null && max != null && min > max) {
      toast.error('Maximum budget must be at least the minimum.');
      return;
    }

    const payload = {
      title: title.trim(),
      subdomainSlug,
      municipalitySlug,
      description: description.trim() || undefined,
      budgetMinCentavos: min,
      budgetMaxCentavos: max,
    };

    try {
      if (isEdit && id) {
        await update.mutateAsync({
          ...payload,
          budgetMinCentavos: min ?? null,
          budgetMaxCentavos: max ?? null,
        });
        toast.success('Posting updated');
        void navigate(`/postings/${id}`);
      } else {
        const days = Number(expiresInDays) || 30;
        await create.mutateAsync({ ...payload, expiresInDays: days });
        toast.success('Posting published');
        void navigate(`/postings/mine`);
      }
    } catch (err) {
      toast.error(toApiError(err).message);
    }
  }

  const pending = create.isPending || update.isPending;
  const loadingForm = isEdit && existing.isPending;

  return (
    <>
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <Eyebrow>{isEdit ? 'Edit posting' : 'Post work'}</Eyebrow>
          <h1 className="u-display mt-4 text-3xl text-ink md:text-4xl">
            {isEdit ? 'Update your posting' : 'Describe the work you need'}
          </h1>
          <p className="mt-4 flex max-w-xl items-start gap-2.5 rounded-sm bg-primary-soft px-4 py-3 text-sm text-navy-800">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Creatives whose sub-domains match will see this on their Home feed.
          </p>

          {loadingForm && <Skeleton className="mt-10 h-96 w-full" />}

          {!loadingForm && (
            <Card as="section" className="mt-8 p-5 sm:p-8">
              <form onSubmit={(e) => void onSubmit(e)} className="space-y-6" noValidate>
                <Input
                  label="Title"
                  required
                  minLength={3}
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                <Select
                  label="Domain"
                  required
                  value={domainSlug}
                  placeholder="Choose a domain"
                  onValueChange={(next) => {
                    setDomainSlug(next);
                    setSubdomainSlug('');
                  }}
                  options={(domains.data ?? []).map((d) => ({ value: d.slug, label: d.name }))}
                />

                <Select
                  label="Sub-domain"
                  required
                  value={subdomainSlug}
                  placeholder="Choose a sub-domain"
                  disabled={!selectedDomain}
                  onValueChange={setSubdomainSlug}
                  options={(selectedDomain?.subdomains ?? []).map((sd) => ({
                    value: sd.slug,
                    label: sd.name,
                  }))}
                />

                <Select
                  label="Municipality (where the work is)"
                  required
                  value={municipalitySlug}
                  placeholder="Choose a municipality"
                  onValueChange={setMunicipalitySlug}
                  options={(municipalities.data ?? []).map((m) => ({
                    value: m.slug,
                    label: m.name,
                  }))}
                />

                <Textarea
                  label="Description"
                  maxLength={2000}
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <fieldset className="grid gap-3">
                  <legend className="text-sm font-semibold text-ink">Budget (optional)</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <PesoInput label="Minimum" value={budgetMin} onValueChange={setBudgetMin} />
                    <PesoInput label="Maximum" value={budgetMax} onValueChange={setBudgetMax} />
                  </div>
                </fieldset>

                {!isEdit && (
                  <Input
                    label="How long to run (days)"
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                  />
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-hairline pt-6 sm:flex-row sm:justify-end">
                  <ButtonLink
                    to={isEdit && id ? `/postings/${id}` : '/postings/mine'}
                    variant="secondary"
                    size="lg"
                  >
                    Cancel
                  </ButtonLink>
                  <Button type="submit" variant="accent" size="lg" loading={pending}>
                    {isEdit ? 'Save changes' : 'Publish posting'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <p className="mt-8 text-sm text-ink-muted">
            <Link to="/postings/mine" className="link-underline text-navy-700">
              Your postings
            </Link>
          </p>
        </Container>
      </main>
    </>
  );
}
