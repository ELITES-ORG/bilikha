import { LegalLayout, LegalList, LegalSection, LegalText } from './LegalLayout';

/**
 * The terms of use.
 *
 * Written against what the product actually does — the 18+ check, the review
 * queue, the six-offer limit, the agreement flow, ratings tied to agreements,
 * reporting and blocking — rather than adapted from a marketplace template. The
 * most important thing it says is the thing a template would not: Bilikha is
 * not a party to the work, does not hold the money, and does not guarantee
 * anybody.
 *
 * The words live in the translation catalogue (`terms.*`, plan 0050 phase 6).
 * Before any of them is translated, read the warning at the top of that block
 * in `en.ts`: this is a document people consent to, not ordinary copy.
 */
export function TermsPage() {
  return (
    <LegalLayout
      titleKey="terms.title"
      summaryKey="terms.summary"
      other={{ to: '/privacy', labelKey: 'terms.otherLink' }}
    >
      <LegalSection titleKey="terms.what.heading">
        <p>
          <LegalText k="terms.what.registry" />
        </p>
        <p>
          <strong className="text-ink">
            <LegalText k="terms.what.notPartyLead" />
          </strong>{' '}
          <LegalText k="terms.what.notPartyRest" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.who.heading">
        <p>
          <LegalText k="terms.who.id" />
        </p>
        <p>
          <LegalText k="terms.who.age" />
        </p>
        <p>
          <LegalText k="terms.who.once" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.profiles.heading">
        <LegalList
          items={[
            <LegalText key="terms.profiles.review" k="terms.profiles.review" />,
            <LegalText key="terms.profiles.limits" k="terms.profiles.limits" />,
            <LegalText key="terms.profiles.honest" k="terms.profiles.honest" />,
            <LegalText key="terms.profiles.ownership" k="terms.profiles.ownership" />,
            <LegalText key="terms.profiles.rights" k="terms.profiles.rights" />,
          ]}
        />
      </LegalSection>

      <LegalSection titleKey="terms.agreements.heading">
        <LegalList
          items={[
            <LegalText key="terms.agreements.postings" k="terms.agreements.postings" />,
            <LegalText key="terms.agreements.records" k="terms.agreements.records" />,
            <LegalText key="terms.agreements.noEnforce" k="terms.agreements.noEnforce" />,
          ]}
        />
      </LegalSection>

      <LegalSection titleKey="terms.ratings.heading">
        <p>
          <LegalText k="terms.ratings.body" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.behaviour.heading">
        <p>
          <LegalText k="terms.behaviour.intro" />
        </p>
        <LegalList
          items={[
            <LegalText key="terms.behaviour.harass" k="terms.behaviour.harass" />,
            <LegalText key="terms.behaviour.unlawful" k="terms.behaviour.unlawful" />,
            <LegalText key="terms.behaviour.impersonate" k="terms.behaviour.impersonate" />,
            <LegalText key="terms.behaviour.advertise" k="terms.behaviour.advertise" />,
            <LegalText key="terms.behaviour.abuse" k="terms.behaviour.abuse" />,
          ]}
        />
        <p>
          <LegalText k="terms.behaviour.reports" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.availability.heading">
        <p>
          <LegalText k="terms.availability.body" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.ending.heading">
        <p>
          <LegalText k="terms.ending.body" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.changes.heading">
        <p>
          <LegalText k="terms.changes.body" />
        </p>
      </LegalSection>

      <LegalSection titleKey="terms.law.heading">
        <p>
          <LegalText k="terms.law.body" />
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
