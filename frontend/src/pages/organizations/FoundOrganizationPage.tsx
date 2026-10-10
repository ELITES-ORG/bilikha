import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Container, Eyebrow } from '@/components/ui';
import { toFieldErrors } from '@/features/auth/field-errors';
import { useFoundOrganization } from '@/features/organizations/api';
import {
  OrganizationFields,
  type OrganizationFormState,
} from '@/features/organizations/OrganizationFields';
import { useT } from '@/i18n/i18n-context';
import { Message } from '@/i18n/Message';
import { toApiError } from '@/lib/api-client';
import { pbBottomNav } from '@/lib/bottom-nav';

const EMPTY_FORM: OrganizationFormState = {
  name: '',
  bio: '',
  municipalitySlug: '',
  subdomainSlugs: [],
  primarySubdomainSlug: '',
};

/**
 * Founding an organisation (ADR 0054). Only a creative with a published
 * profile may found one, and the server says so in its own words if not —
 * this page does not try to predict the answer. The page is reviewed before it
 * is public, so the founder lands on the team page, where they can invite
 * people while they wait.
 */
export function FoundOrganizationPage() {
  const t = useT();
  const navigate = useNavigate();
  const found = useFoundOrganization();
  const [form, setForm] = useState<OrganizationFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof OrganizationFormState>(key: K, value: OrganizationFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (!form.primarySubdomainSlug) {
      setFieldErrors({ subdomainSlugs: t('organizations.fields.craftsRequired') });
      return;
    }

    try {
      const { slug } = await found.mutateAsync({
        name: form.name,
        bio: form.bio || undefined,
        municipalitySlug: form.municipalitySlug,
        subdomainSlugs: form.subdomainSlugs,
        primarySubdomainSlug: form.primarySubdomainSlug,
      });
      void navigate(`/organizations/${slug}/manage`);
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      } else {
        setFormError(toApiError(error).message);
      }
    }
  }

  return (
    <main className={pbBottomNav}>
      <Container width="narrow" className="py-(--section-gap)">
        <Eyebrow>
          <Message k="organizations.found.eyebrow" />
        </Eyebrow>
        <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
          <Message k="organizations.found.heading" />
        </h1>
        <p className="mt-3 max-w-xl text-md text-ink-muted">
          <Message k="organizations.found.intro" />
        </p>

        <form onSubmit={(event) => void onSubmit(event)} className="mt-10 space-y-8" noValidate>
          {formError && (
            <p
              className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
              role="alert"
            >
              {formError}
            </p>
          )}

          <OrganizationFields
            form={form}
            fieldErrors={fieldErrors}
            canEditCrafts
            onUpdate={update}
          />

          <Button type="submit" size="lg" loading={found.isPending} disabled={found.isPending}>
            <Message k="organizations.found.submit" />
          </Button>
        </form>
      </Container>
    </main>
  );
}
