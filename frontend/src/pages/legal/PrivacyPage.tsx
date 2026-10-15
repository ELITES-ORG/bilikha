import type { MessageKey } from '@/i18n/catalogs/en';
import { LegalLayout, LegalList, LegalSection, LegalText } from './LegalLayout';
import { LEGAL_CONTACT, LEGAL_OPERATOR } from '@/lib/legal';

/**
 * The privacy notice.
 *
 * Every factual claim here was read off the code rather than adapted from a
 * template: the collected fields are `registerSchema`, the published fields are
 * the `PublicProfile` contract, and the parts that say a thing is *not* shared
 * are true because no endpoint returns them. If any of those change, this page
 * is wrong and has to change with them.
 *
 * The words live in the translation catalogue (`privacy.*`, plan 0050 phase 6).
 * Before any of them is translated, read the warning at the top of that block
 * in `en.ts`: this is a document people consent to, not ordinary copy.
 */

/** A list item that opens with a bold phrase and, usually, continues it. */
function Item({ lead, rest }: { lead: MessageKey; rest?: MessageKey }) {
  return (
    <>
      <strong className="text-ink">
        <LegalText k={lead} />
      </strong>
      {rest && <LegalText k={rest} />}
    </>
  );
}

/** A list item whose bold label stands apart from a sentence that is complete on its own. */
function Labelled({ lead, text }: { lead: MessageKey; text: MessageKey }) {
  return (
    <>
      <strong className="text-ink">
        <LegalText k={lead} />
      </strong>{' '}
      <LegalText k={text} />
    </>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout
      titleKey="privacy.title"
      summaryKey="privacy.summary"
      other={{ to: '/terms', labelKey: 'privacy.otherLink' }}
    >
      <LegalSection titleKey="privacy.responsible.heading">
        <p>
          <LegalText k="privacy.responsible.operatorBefore" />
          {LEGAL_OPERATOR}
          <LegalText k="privacy.responsible.operatorAfter" />
        </p>
        <p>
          <LegalText k="privacy.responsible.builderBefore" />
          <a
            className="link-underline text-navy-700"
            href="https://elitesys.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Elites
            <span className="sr-only">
              <LegalText k="privacy.responsible.newTab" />
            </span>
          </a>
          <LegalText k="privacy.responsible.builderAfter" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.collect.heading">
        <p>
          <LegalText k="privacy.collect.intro" />
        </p>
        <LegalList
          items={[
            <Item key="privacy.collect.nameLead" lead="privacy.collect.nameLead" rest="privacy.collect.nameRest" />,
            <Item key="privacy.collect.usernameLead" lead="privacy.collect.usernameLead" rest="privacy.collect.usernameRest" />,
            <Item key="privacy.collect.contactLead" lead="privacy.collect.contactLead" />,
            <Item key="privacy.collect.birthLead" lead="privacy.collect.birthLead" rest="privacy.collect.birthRest" />,
            <Item key="privacy.collect.locationLead" lead="privacy.collect.locationLead" rest="privacy.collect.locationRest" />,
            <Item key="privacy.collect.passwordLead" lead="privacy.collect.passwordLead" rest="privacy.collect.passwordRest" />,
          ]}
        />
        <p>
          <LegalText k="privacy.collect.consentRecord" />
        </p>
        <p>
          <LegalText k="privacy.collect.idAfter" />
        </p>
      </LegalSection>

      {/* ADR 0057: an ID photo is sensitive personal information. Each claim
          here is read off the code: who sees it, for how long, what stays. */}
      <LegalSection titleKey="privacy.id.heading">
        <p>
          <LegalText k="privacy.id.intro" />
        </p>
        <LegalList
          items={[
            <Labelled key="privacy.id.contents" lead="privacy.id.contentsLead" text="privacy.id.contents" />,
            <Labelled key="privacy.id.purpose" lead="privacy.id.purposeLead" text="privacy.id.purpose" />,
            <Labelled key="privacy.id.who" lead="privacy.id.whoLead" text="privacy.id.who" />,
            <Labelled key="privacy.id.retention" lead="privacy.id.retentionLead" text="privacy.id.retention" />,
            <Labelled key="privacy.id.appeal" lead="privacy.id.appealLead" text="privacy.id.appeal" />,
            <Labelled key="privacy.id.code" lead="privacy.id.codeLead" text="privacy.id.code" />,
            <Labelled key="privacy.id.record" lead="privacy.id.recordLead" text="privacy.id.record" />,
          ]}
        />
        <p>
          <LegalText k="privacy.id.controllerBefore" />
          {LEGAL_OPERATOR}
          <LegalText k="privacy.id.controllerAfter" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.public.heading">
        <p>
          <LegalText k="privacy.public.intro" />
        </p>
        <LegalList
          items={[
            <Item key="privacy.public.fullNameLead" lead="privacy.public.fullNameLead" rest="privacy.public.fullNameRest" />,
            <Item key="privacy.public.displayNameLead" lead="privacy.public.displayNameLead" rest="privacy.public.displayNameRest" />,
            <Item key="privacy.public.bioLead" lead="privacy.public.bioLead" rest="privacy.public.bioRest" />,
            <Item key="privacy.public.craftsLead" lead="privacy.public.craftsLead" rest="privacy.public.craftsRest" />,
            <Item key="privacy.public.municipalityLead" lead="privacy.public.municipalityLead" />,
            <Item key="privacy.public.joinedLead" lead="privacy.public.joinedLead" rest="privacy.public.joinedRest" />,
            <Item key="privacy.public.ratingLead" lead="privacy.public.ratingLead" rest="privacy.public.ratingRest" />,
          ]}
        />
        <p>
          <LegalText k="privacy.public.settingsBefore" />
          <em>
            <LegalText k="privacy.public.settingsShown" />
          </em>
          <LegalText k="privacy.public.settingsBetween" />
          <em>
            <LegalText k="privacy.public.settingsHidden" />
          </em>
          <LegalText k="privacy.public.settingsAfter" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.never.heading">
        <p>
          <LegalText k="privacy.never.intro" />
        </p>
        <LegalList
          items={[
            <Item key="privacy.never.contactLead" lead="privacy.never.contactLead" rest="privacy.never.contactRest" />,
            <Item key="privacy.never.barangayLead" lead="privacy.never.barangayLead" rest="privacy.never.barangayRest" />,
            <Item key="privacy.never.birthLead" lead="privacy.never.birthLead" />,
            <Item key="privacy.never.passwordLead" lead="privacy.never.passwordLead" rest="privacy.never.passwordRest" />,
            <Item key="privacy.never.idLead" lead="privacy.never.idLead" />,
          ]}
        />
      </LegalSection>

      <LegalSection titleKey="privacy.usage.heading">
        <LegalList
          items={[
            <Item key="privacy.usage.messagesLead" lead="privacy.usage.messagesLead" rest="privacy.usage.messagesRest" />,
            <Item key="privacy.usage.postingsLead" lead="privacy.usage.postingsLead" rest="privacy.usage.postingsRest" />,
            <Item key="privacy.usage.ratingsLead" lead="privacy.usage.ratingsLead" rest="privacy.usage.ratingsRest" />,
            <Item key="privacy.usage.reportsLead" lead="privacy.usage.reportsLead" rest="privacy.usage.reportsRest" />,
            <Item key="privacy.usage.sessionsLead" lead="privacy.usage.sessionsLead" rest="privacy.usage.sessionsRest" />,
            <Item key="privacy.usage.searchesLead" lead="privacy.usage.searchesLead" rest="privacy.usage.searchesRest" />,
          ]}
        />
      </LegalSection>

      <LegalSection titleKey="privacy.cookies.heading">
        <p>
          <LegalText k="privacy.cookies.oneBefore" />
          <code className="text-sm">bilikha.sid</code>
          <LegalText k="privacy.cookies.oneAfter" />
        </p>
        <p>
          <LegalText k="privacy.cookies.noTracking" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.sharing.heading">
        <LegalList
          items={[
            <Item key="privacy.sharing.adminsLead" lead="privacy.sharing.adminsLead" rest="privacy.sharing.adminsRest" />,
            <Item key="privacy.sharing.hostsLead" lead="privacy.sharing.hostsLead" rest="privacy.sharing.hostsRest" />,
          ]}
        />
        <p>
          <LegalText k="privacy.sharing.noSale" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.retention.heading">
        <p>
          <LegalText k="privacy.retention.body" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.rights.heading">
        <p>
          <LegalText k="privacy.rights.intro" />
        </p>
        <LegalList
          items={[
            <LegalText key="privacy.rights.access" k="privacy.rights.access" />,
            <LegalText key="privacy.rights.correct" k="privacy.rights.correct" />,
            <LegalText key="privacy.rights.delete" k="privacy.rights.delete" />,
            <LegalText key="privacy.rights.object" k="privacy.rights.object" />,
            <LegalText key="privacy.rights.complain" k="privacy.rights.complain" />,
          ]}
        />
        <p>
          <strong className="text-ink">
            <LegalText k="privacy.rights.manualLead" />
          </strong>{' '}
          <LegalText k="privacy.rights.manualRest" />{' '}
          {LEGAL_CONTACT ? (
            <>
              <LegalText k="privacy.rights.writeBefore" />
              <a className="link-underline text-navy-700" href={`mailto:${LEGAL_CONTACT}`}>
                {LEGAL_CONTACT}
              </a>
              <LegalText k="privacy.rights.writeAfter" />
            </>
          ) : (
            <LegalText k="privacy.rights.askRegistrar" />
          )}
        </p>
        <p>
          <LegalText k="privacy.rights.sharedRecords" />
        </p>
      </LegalSection>

      <LegalSection titleKey="privacy.changes.heading">
        <p>
          <LegalText k="privacy.changes.body" />
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
