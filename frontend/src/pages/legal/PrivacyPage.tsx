import { LegalLayout, LegalList, LegalSection } from './LegalLayout';
import { LEGAL_CONTACT } from '@/lib/legal';

/**
 * The privacy notice.
 *
 * Every factual claim here was read off the code rather than adapted from a
 * template: the collected fields are `registerSchema`, the published fields are
 * the `PublicProfile` contract, and the parts that say a thing is *not* shared
 * are true because no endpoint returns them. If any of those change, this page
 * is wrong and has to change with them.
 */
export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy notice"
      summary="What Bilikha collects, what it publishes, and what you can ask us to do about it."
      other={{ to: '/terms', label: 'Read the terms of use →' }}
    >
      <LegalSection title="Who is responsible">
        <p>
          Bilikha is a registry of creative work in the province of Biliran. Whoever
          operates it is the personal information controller for the data described
          here, under Republic Act 10173, the Data Privacy Act of 2012.
        </p>
      </LegalSection>

      <LegalSection title="What we collect when you register">
        <p>You cannot create an account without giving all of these:</p>
        <LegalList
          items={[
            <>
              <strong className="text-ink">Your name</strong> — first, middle, last and
              suffix. Middle name and suffix may be left blank.
            </>,
            <>
              <strong className="text-ink">A username</strong>, which is how you sign in.
            </>,
            <>
              <strong className="text-ink">Your email address and phone number.</strong>
            </>,
            <>
              <strong className="text-ink">Your date of birth</strong>, used once, to check
              that you are 18 or over. Accounts are not created for anyone younger.
            </>,
            <>
              <strong className="text-ink">Your municipality and barangay</strong> in Biliran.
            </>,
            <>
              <strong className="text-ink">A password</strong>, which is stored only as an
              Argon2id hash. It cannot be read back, by us or by anyone with a copy of the
              database.
            </>,
          ]}
        />
        <p>
          We also record the date you accepted this notice and the terms, and which version
          of them you accepted.
        </p>
      </LegalSection>

      <LegalSection title="What appears on your public profile">
        <p>
          If you set up a creative profile, these are visible to anyone on the internet,
          signed in or not:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-ink">Your full name</strong> — first, middle, last and
              suffix joined together. If you would rather not publish your middle name or
              suffix, leave them blank when you register.
            </>,
            <>
              <strong className="text-ink">Your display name</strong>, if you set one. It
              starts as your username. Clear it and your full name is shown instead.
            </>,
            <><strong className="text-ink">Your bio</strong>, your profile photo.</>,
            <>
              <strong className="text-ink">The crafts you selected</strong>, and which one is
              your primary craft.
            </>,
            <><strong className="text-ink">Your municipality.</strong></>,
            <>
              <strong className="text-ink">The month you joined</strong>, your offers, their
              prices and their images.
            </>,
            <>
              <strong className="text-ink">Your average rating and how many ratings</strong>{' '}
              you have, once you have any.
            </>,
          ]}
        />
        <p>
          The profile settings page groups your fields under{' '}
          <em>Shown on your public profile</em> and <em>Not shown publicly</em>, so you can
          check this against your own account at any time.
        </p>
      </LegalSection>

      <LegalSection title="What is never published">
        <p>
          These are held but are not on your profile, not in the directory, and not returned
          by any public part of the service:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-ink">Your email address and phone number.</strong> One
              of them — whichever you choose as your contact preference — is shared only when
              you decide to share it inside a conversation.
            </>,
            <>
              <strong className="text-ink">Your barangay.</strong> It is used to order the
              directory so people nearer you appear first, and for nothing else.
            </>,
            <><strong className="text-ink">Your date of birth.</strong></>,
            <><strong className="text-ink">Your password</strong>, in any form.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="What we collect as you use the service">
        <LegalList
          items={[
            <>
              <strong className="text-ink">Messages and conversations</strong> between you and
              the other party, and any agreement you send, accept or decline. An accepted
              agreement is kept with a fingerprint of the exact text both sides accepted, so
              neither of you can be shown different terms later.
            </>,
            <>
              <strong className="text-ink">Postings</strong> you publish, and replies to them.
            </>,
            <>
              <strong className="text-ink">Ratings and comments</strong> you leave after an
              agreement, and ones left about you.
            </>,
            <>
              <strong className="text-ink">Reports and blocks</strong> you make, and ones made
              about you.
            </>,
            <>
              <strong className="text-ink">Sign-in sessions</strong>, and the date you last
              signed in.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          One cookie, <code className="text-sm">bilikha.sid</code>, which keeps you signed in.
          It is set only after you sign in, expires after 30 days, cannot be read by
          JavaScript, and is sent only to this site.
        </p>
        <p>
          There is no advertising, no analytics service, and no third-party tracker anywhere on
          Bilikha. Nothing about your visit is sent to another company for measurement.
        </p>
      </LegalSection>

      <LegalSection title="Who else can see your data">
        <LegalList
          items={[
            <>
              <strong className="text-ink">Administrators of the registry</strong> can see your
              email, phone and date of birth. This is so profiles and images can be reviewed
              before they go public, and so reports can be acted on.
            </>,
            <>
              <strong className="text-ink">The companies that host the service.</strong> The
              database and uploaded images are held by Supabase; the site and the API run on
              hosting providers who necessarily process the traffic. They act on our
              instructions and do not use your data for their own purposes.
            </>,
          ]}
        />
        <p>
          We do not sell your data, and we do not share it with anyone else except where the law
          requires it.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Your account and profile are kept until you ask us to delete them. Sessions expire
          after 30 days. Messages, agreements and ratings are kept as long as the account
          exists, because each of them is a record shared with another person who is entitled
          to their copy of it.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Under RA 10173 you may:</p>
        <LegalList
          items={[
            <>Be told what we hold about you, and get a copy of it.</>,
            <>Correct anything inaccurate — most of it you can edit yourself on your profile.</>,
            <>Ask for your account and data to be deleted.</>,
            <>Object to how we use your data, or withdraw your consent.</>,
            <>Complain to the National Privacy Commission.</>,
          ]}
        />
        <p>
          <strong className="text-ink">
            Export and deletion are not yet buttons you can press.
          </strong>{' '}
          They are handled by request while that is being built.{' '}
          {LEGAL_CONTACT ? (
            <>
              Write to <a className="link-underline text-lawa-700" href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and we will
              do it by hand.
            </>
          ) : (
            <>Ask whoever registered you and it will be done by hand.</>
          )}
        </p>
        <p>
          Deleting an account does not erase the other side of a shared record. Messages you
          sent remain in the other person&rsquo;s conversation, and an agreement you accepted
          remains with the person who accepted it with you — they are that person&rsquo;s record
          as much as yours.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this notice">
        <p>
          If what we collect or publish changes, this page changes with it and the date at the
          top moves. Where a change materially affects you, we will ask you to accept it again
          rather than relying on you noticing.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
