/**
 * The English catalogue — the source of truth and the fallback (ADR 0055).
 *
 * Bundled rather than fetched, because this *is* the interface text: moving a
 * string out of a component and into here moves bytes rather than adding
 * them. Every other language is a dynamic import, so an English-only visitor
 * downloads nothing extra (constraint 3).
 *
 * Keys are dotted and named for where the string appears, not for what it
 * says, so rewording the copy never means renaming the key.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` with an empty
 * value. `catalogs.test.ts` fails if you forget.
 */
export const en = {
  'signIn.eyebrow': 'Welcome back',
  'signIn.heading': 'Sign in',
  'signIn.intro': 'Use the username and password you chose at registration.',
  'signIn.username': 'Username',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.register': 'Register',
  'signIn.noSelfService':
    'Forgotten your password? An administrator must reset it — there is no self-service reset in this release.',

  'account.language.label': 'Language',
  'account.language.description':
    'Changes the interface on this device. Not everything is translated yet.',

  // The privacy notice and terms of use — what people agree to under RA 10173.
  //
  // Before translating ANY of these, two questions must be settled by reyxdz,
  // because a translated consent document is a legal record, not just copy:
  //  1. Which version is authoritative if a translation and the English differ.
  //  2. Whether an account records which language its owner agreed in —
  //     `users.consent_version` holds a date only.
  // And per ADR 0055: written or reviewed by a fluent speaker, never machine
  // translation. See docs/plans/0050, phase 6.
  //
  // "…Lead" is a bold phrase and "…Rest" continues the same sentence, so it
  // keeps its own leading space or comma. "…Before"/"…After" sit either side of
  // a link, a name or a value that is not translated.
  'legal.lastUpdatedBefore': 'Last updated ',
  'legal.lastUpdatedAfter': '.',
  'legal.contactPending': 'A contact address for privacy requests is being set up. Until it is published here, reach whoever registered you — this notice will not name an address that nobody reads.',
  'privacy.title': 'Privacy notice',
  'privacy.summary': 'What Bilikha collects, what it publishes, and what you can ask us to do about it.',
  'privacy.otherLink': 'Read the terms of use →',
  'privacy.responsible.heading': 'Who is responsible',
  'privacy.responsible.operatorBefore': 'Bilikha is a registry of creative work in the province of Biliran. It is operated by the ',
  'privacy.responsible.operatorAfter': ', the personal information controller for the data described here, under Republic Act 10173, the Data Privacy Act of 2012.',
  'privacy.responsible.builderBefore': 'The software is built and maintained for the province by ',
  'privacy.responsible.newTab': ' (opens in a new tab)',
  'privacy.responsible.builderAfter': '.',
  'privacy.collect.heading': 'What we collect when you register',
  'privacy.collect.intro': 'You cannot create an account without giving all of these:',
  'privacy.collect.nameLead': 'Your name',
  'privacy.collect.nameRest': ' — first, middle, last and suffix. Middle name and suffix may be left blank.',
  'privacy.collect.usernameLead': 'A username',
  'privacy.collect.usernameRest': ', which is how you sign in.',
  'privacy.collect.contactLead': 'Your email address and phone number.',
  'privacy.collect.birthLead': 'Your date of birth',
  'privacy.collect.birthRest': ', used once, to check that you are 18 or over. Accounts are not created for anyone younger.',
  'privacy.collect.locationLead': 'Your municipality and barangay',
  'privacy.collect.locationRest': ' in Biliran.',
  'privacy.collect.passwordLead': 'A password',
  'privacy.collect.passwordRest': ', which is stored only as an Argon2id hash. It cannot be read back, by us or by anyone with a copy of the database.',
  'privacy.collect.consentRecord': 'We also record the date you accepted this notice and the terms, and which version of them you accepted.',
  'privacy.public.heading': 'What appears on your public profile',
  'privacy.public.intro': 'If you set up a creative profile, these are visible to anyone on the internet, signed in or not:',
  'privacy.public.fullNameLead': 'Your full name',
  'privacy.public.fullNameRest': ' — first, middle, last and suffix joined together. If you would rather not publish your middle name or suffix, leave them blank when you register.',
  'privacy.public.displayNameLead': 'Your display name',
  'privacy.public.displayNameRest': ', if you set one. It starts as your username. Clear it and your full name is shown instead.',
  'privacy.public.bioLead': 'Your bio',
  'privacy.public.bioRest': ', your profile photo.',
  'privacy.public.craftsLead': 'The crafts you selected',
  'privacy.public.craftsRest': ', and which one is your primary craft.',
  'privacy.public.municipalityLead': 'Your municipality.',
  'privacy.public.joinedLead': 'The month you joined',
  'privacy.public.joinedRest': ', your offers, their prices and their images.',
  'privacy.public.ratingLead': 'Your average rating and how many ratings',
  'privacy.public.ratingRest': ' you have, once you have any.',
  'privacy.public.settingsBefore': 'The profile settings page groups your fields under ',
  'privacy.public.settingsShown': 'Shown on your public profile',
  'privacy.public.settingsBetween': ' and ',
  'privacy.public.settingsHidden': 'Not shown publicly',
  'privacy.public.settingsAfter': ', so you can check this against your own account at any time.',
  'privacy.never.heading': 'What is never published',
  'privacy.never.intro': 'These are held but are not on your profile, not in the directory, and not returned by any public part of the service:',
  'privacy.never.contactLead': 'Your email address and phone number.',
  'privacy.never.contactRest': ' One of them — whichever you choose as your contact preference — is shared only when you decide to share it inside a conversation.',
  'privacy.never.barangayLead': 'Your barangay.',
  'privacy.never.barangayRest': ' It is used to order the directory so people nearer you appear first, and for nothing else.',
  'privacy.never.birthLead': 'Your date of birth.',
  'privacy.never.passwordLead': 'Your password',
  'privacy.never.passwordRest': ', in any form.',
  'privacy.usage.heading': 'What we collect as you use the service',
  'privacy.usage.messagesLead': 'Messages and conversations',
  'privacy.usage.messagesRest': ' between you and the other party, and any agreement you send, accept or decline. An accepted agreement is kept with a fingerprint of the exact text both sides accepted, so neither of you can be shown different terms later.',
  'privacy.usage.postingsLead': 'Postings',
  'privacy.usage.postingsRest': ' you publish, and replies to them.',
  'privacy.usage.ratingsLead': 'Ratings and comments',
  'privacy.usage.ratingsRest': ' you leave after an agreement, and ones left about you.',
  'privacy.usage.reportsLead': 'Reports and blocks',
  'privacy.usage.reportsRest': ' you make, and ones made about you.',
  'privacy.usage.sessionsLead': 'Sign-in sessions',
  'privacy.usage.sessionsRest': ', and the date you last signed in.',
  'privacy.cookies.heading': 'Cookies',
  'privacy.cookies.oneBefore': 'One cookie, ',
  'privacy.cookies.oneAfter': ', which keeps you signed in. It is set only after you sign in, expires after 30 days, cannot be read by JavaScript, and is sent only to this site.',
  'privacy.cookies.noTracking': 'There is no advertising, no analytics service, and no third-party tracker anywhere on Bilikha. Nothing about your visit is sent to another company for measurement.',
  'privacy.sharing.heading': 'Who else can see your data',
  'privacy.sharing.adminsLead': 'Administrators of the registry',
  'privacy.sharing.adminsRest': ' can see your email, phone and date of birth. This is so profiles and images can be reviewed before they go public, and so reports can be acted on.',
  'privacy.sharing.hostsLead': 'The companies that host the service.',
  'privacy.sharing.hostsRest': ' The database and uploaded images are held by Supabase; the site and the API run on hosting providers who necessarily process the traffic. They act on our instructions and do not use your data for their own purposes.',
  'privacy.sharing.noSale': 'We do not sell your data, and we do not share it with anyone else except where the law requires it.',
  'privacy.retention.heading': 'How long we keep it',
  'privacy.retention.body': 'Your account and profile are kept until you ask us to delete them. Sessions expire after 30 days. Messages, agreements and ratings are kept as long as the account exists, because each of them is a record shared with another person who is entitled to their copy of it.',
  'privacy.rights.heading': 'Your rights',
  'privacy.rights.intro': 'Under RA 10173 you may:',
  'privacy.rights.access': 'Be told what we hold about you, and get a copy of it.',
  'privacy.rights.correct': 'Correct anything inaccurate — most of it you can edit yourself on your profile.',
  'privacy.rights.delete': 'Ask for your account and data to be deleted.',
  'privacy.rights.object': 'Object to how we use your data, or withdraw your consent.',
  'privacy.rights.complain': 'Complain to the National Privacy Commission.',
  'privacy.rights.manualLead': 'Export and deletion are not yet buttons you can press.',
  'privacy.rights.manualRest': 'They are handled by request while that is being built.',
  'privacy.rights.writeBefore': 'Write to ',
  'privacy.rights.writeAfter': ' and we will do it by hand.',
  'privacy.rights.askRegistrar': 'Ask whoever registered you and it will be done by hand.',
  'privacy.rights.sharedRecords': 'Deleting an account does not erase the other side of a shared record. Messages you sent remain in the other person’s conversation, and an agreement you accepted remains with the person who accepted it with you — they are that person’s record as much as yours.',
  'privacy.changes.heading': 'Changes to this notice',
  'privacy.changes.body': 'If what we collect or publish changes, this page changes with it and the date at the top moves. Where a change materially affects you, we will ask you to accept it again rather than relying on you noticing.',
  'terms.title': 'Terms of use',
  'terms.summary': 'What Bilikha does, what it does not do, and what is expected of you while you use it.',
  'terms.otherLink': 'Read the privacy notice →',
  'terms.what.heading': 'What Bilikha is',
  'terms.what.registry': 'Bilikha is a registry. It lists creative practitioners in Biliran and the work they offer, and it gives people a way to find each other and agree terms in writing.',
  'terms.what.notPartyLead': 'It is not a party to any work you agree to do or pay for.',
  'terms.what.notPartyRest': 'It does not hold or transfer money, does not guarantee that anyone is competent, honest or available, and does not employ or represent the people listed on it. An agreement made here is between you and the other person.',
  'terms.who.heading': 'Who may use it',
  'terms.who.age': 'You must be at least 18 years old. Accounts are not created for anyone younger, and your date of birth is checked when you register.',
  'terms.who.once': 'Register once, with your real name and your own contact details. An account is yours alone — do not share your password, and tell us if you think someone else has it.',
  'terms.profiles.heading': 'Profiles and offers',
  'terms.profiles.review': 'A creative profile is reviewed before it appears publicly, and so are profile photos and offer images. A profile can be rejected, and you will be told why.',
  'terms.profiles.limits': 'You may list up to six offers, each with up to four images, and you choose the order they appear in.',
  'terms.profiles.honest': 'Describe what you actually do and price it honestly. Do not list work you cannot deliver, and do not use someone else’s photographs as your own.',
  'terms.profiles.ownership': 'You keep ownership of what you upload. By putting it on Bilikha you allow us to display it on the registry, at the sizes the site needs, for as long as it is on your profile.',
  'terms.agreements.heading': 'Postings and agreements',
  'terms.agreements.postings': 'A posting describes work you want done. It expires on its own, and you can close it once it is filled or no longer needed.',
  'terms.agreements.records': 'An agreement records what was agreed: the work, the price, and the terms. When both sides accept it, Bilikha keeps a fingerprint of the exact text that was accepted, so neither side can later be shown a different version.',
  'terms.agreements.noEnforce': 'Bilikha does not enforce agreements, chase payment, or arbitrate disputes. It records what was agreed so that you can.',
  'terms.ratings.heading': 'Ratings',
  'terms.ratings.body': 'You can rate the other person only after an agreement between you, and only once for each. Rate the work that actually happened. Ratings are not for pressure, retaliation, or settling something unrelated, and ratings that are can be removed.',
  'terms.behaviour.heading': 'Behaviour',
  'terms.behaviour.intro': 'While using Bilikha, do not:',
  'terms.behaviour.harass': 'Harass, threaten or abuse anyone.',
  'terms.behaviour.unlawful': 'Post anything unlawful, or anything you have no right to post.',
  'terms.behaviour.impersonate': 'Impersonate another person, or misrepresent who you are.',
  'terms.behaviour.advertise': 'Use the registry to advertise something other than creative work in Biliran.',
  'terms.behaviour.abuse': 'Attempt to break, overload or extract data in bulk from the service.',
  'terms.behaviour.reports': 'You can report a conversation or a rating, and you can block someone. Reports are read by an administrator, who may remove content, suspend an account, or refuse a profile.',
  'terms.availability.heading': 'Availability',
  'terms.availability.body': 'Bilikha is provided as it is. It may be unavailable, lose recent changes during an incident, or change in ways that remove things you were using. It is a small service for a small province and is run accordingly — treat anything important to you as something to keep your own copy of.',
  'terms.ending.heading': 'Ending your use',
  'terms.ending.body': 'You may stop using Bilikha at any time and ask for your account to be deleted; the privacy notice explains what that does and does not remove. We may suspend or remove an account that breaks these terms, or that is being used to harm someone.',
  'terms.changes.heading': 'Changes to these terms',
  'terms.changes.body': 'These terms change as the service does, and the date at the top moves when they do. Where a change materially affects you, we will ask you to accept it again rather than relying on you noticing.',
  'terms.law.heading': 'Governing law',
  'terms.law.body': 'These terms are governed by the laws of the Republic of the Philippines.',
} as const;

/** Every key the app may ask for. Other catalogues are checked against it. */
export type MessageKey = keyof typeof en;

export type Catalog = Readonly<Partial<Record<MessageKey, string>>>;
