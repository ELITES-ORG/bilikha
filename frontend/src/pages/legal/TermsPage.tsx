import { LegalLayout, LegalList, LegalSection } from './LegalLayout';

/**
 * The terms of use.
 *
 * Written against what the product actually does — the 18+ check, the review
 * queue, the six-offer limit, the agreement flow, ratings tied to agreements,
 * reporting and blocking — rather than adapted from a marketplace template. The
 * most important thing it says is the thing a template would not: Bilikha is
 * not a party to the work, does not hold the money, and does not guarantee
 * anybody.
 */
export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of use"
      summary="What Bilikha does, what it does not do, and what is expected of you while you use it."
      other={{ to: '/privacy', label: 'Read the privacy notice →' }}
    >
      <LegalSection title="What Bilikha is">
        <p>
          Bilikha is a registry. It lists creative practitioners in Biliran and the work they
          offer, and it gives people a way to find each other and agree terms in writing.
        </p>
        <p>
          <strong className="text-ink">
            It is not a party to any work you agree to do or pay for.
          </strong>{' '}
          It does not hold or transfer money, does not guarantee that anyone is competent,
          honest or available, and does not employ or represent the people listed on it. An
          agreement made here is between you and the other person.
        </p>
      </LegalSection>

      <LegalSection title="Who may use it">
        <p>
          You must be at least 18 years old. Accounts are not created for anyone younger, and
          your date of birth is checked when you register.
        </p>
        <p>
          Register once, with your real name and your own contact details. An account is yours
          alone — do not share your password, and tell us if you think someone else has it.
        </p>
      </LegalSection>

      <LegalSection title="Profiles and offers">
        <LegalList
          items={[
            <>
              A creative profile is reviewed before it appears publicly, and so are profile
              photos and offer images. A profile can be rejected, and you will be told why.
            </>,
            <>
              You may list up to six offers, each with up to four images, and you choose the
              order they appear in.
            </>,
            <>
              Describe what you actually do and price it honestly. Do not list work you cannot
              deliver, and do not use someone else&rsquo;s photographs as your own.
            </>,
            <>
              You keep ownership of what you upload. By putting it on Bilikha you allow us to
              display it on the registry, at the sizes the site needs, for as long as it is on
              your profile.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Postings and agreements">
        <LegalList
          items={[
            <>
              A posting describes work you want done. It expires on its own, and you can close
              it once it is filled or no longer needed.
            </>,
            <>
              An agreement records what was agreed: the work, the price, and the terms. When
              both sides accept it, Bilikha keeps a fingerprint of the exact text that was
              accepted, so neither side can later be shown a different version.
            </>,
            <>
              Bilikha does not enforce agreements, chase payment, or arbitrate disputes. It
              records what was agreed so that you can.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Ratings">
        <p>
          You can rate the other person only after an agreement between you, and only once for
          each. Rate the work that actually happened. Ratings are not for pressure,
          retaliation, or settling something unrelated, and ratings that are can be removed.
        </p>
      </LegalSection>

      <LegalSection title="Behaviour">
        <p>While using Bilikha, do not:</p>
        <LegalList
          items={[
            <>Harass, threaten or abuse anyone.</>,
            <>Post anything unlawful, or anything you have no right to post.</>,
            <>Impersonate another person, or misrepresent who you are.</>,
            <>Use the registry to advertise something other than creative work in Biliran.</>,
            <>Attempt to break, overload or extract data in bulk from the service.</>,
          ]}
        />
        <p>
          You can report a conversation or a rating, and you can block someone. Reports are
          read by an administrator, who may remove content, suspend an account, or refuse a
          profile.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          Bilikha is provided as it is. It may be unavailable, lose recent changes during an
          incident, or change in ways that remove things you were using. It is a small service
          for a small province and is run accordingly — treat anything important to you as
          something to keep your own copy of.
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>
          You may stop using Bilikha at any time and ask for your account to be deleted; the{' '}
          privacy notice explains what that does and does not remove. We may suspend or remove
          an account that breaks these terms, or that is being used to harm someone.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          These terms change as the service does, and the date at the top moves when they do.
          Where a change materially affects you, we will ask you to accept it again rather
          than relying on you noticing.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of the Republic of the Philippines.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
