/**
 * ⚠️ COPY. The source of truth is treyo-mobile/constants/legal.ts.
 *
 * These are the same documents the mobile app shows, published on the
 * web because the ClicToPay merchant contract requires them to be
 * reachable before payment. The two projects have no shared package, so
 * this is a copy rather than an import.
 *
 * EDIT THE MOBILE FILE, THEN RE-COPY:
 *   cp treyo-mobile/constants/legal.ts admin-dashboard/src/content/legal.ts
 *
 * Editing only one side means the app and the website state different
 * terms for the same service, which is worse than having no web copy.
 *
 * ── Original header ─────────────────────────────────────────────────
 *
 * Terms of Service + Privacy Policy content.
 *
 * Legal entity: LeanConsulting
 * Country: Tunisia
 * Cloud / hosting provider: OxaHost
 * Payment provider: ClickToPay by Tunisie Monétique
 *
 * IMPORTANT — these documents are drafted to accurately describe what Treyo
 * currently does based on the project information provided.
 * They have NOT been reviewed by a lawyer.
 *
 * Before relying on these documents in a production/commercial environment,
 * LeanConsulting should have them reviewed by qualified legal counsel.
 */

export const LEGAL_LAST_UPDATED = 'August 2026';

/**
 * The address users are told to write to for legal and support matters.
 *
 * Was support@lean-consulting.com, which is neither the company's domain
 * (leanconsulting.com.tn, no hyphen) nor an address anyone monitors —
 * so every message sent to it went nowhere.
 */
export const LEGAL_CONTACT_EMAIL = 'direction@leanconsulting.com.tn';

export const LEGAL_ENTITY_NAME = 'LeanConsulting';

export const LEGAL_ENTITY_COUNTRY = 'Tunisia';

export const LEGAL_ENTITY_ADDRESS =
    '162, Avenue l’UMA, Immeuble Omrane Centre, Bureau B1.4, La Soukra, Ariana 2036, Tunisia';

export type LegalSection = {
    heading: string;
    /** Rendered as paragraphs; strings starting with "• " render as bullets. */
    body: string[];
};

export const TERMS_SECTIONS: LegalSection[] = [
    {
        heading: '1. About these terms',
        body: [
            'Treyo is a platform operated by LeanConsulting that connects learners with professional trainers. These Terms govern your use of the Treyo mobile application and related services (the "Service").',
            'By creating an account or using the Service, you agree to these Terms. If you do not agree, please do not use the Service.',
            'The Service is operated from Tunisia and is intended to comply with applicable Tunisian laws and regulations. Where the laws of another jurisdiction, including laws applicable in the European Economic Area, apply to a particular user or activity, Treyo will comply with those requirements to the extent legally applicable.',
        ],
    },

    {
        heading: '2. Accounts',
        body: [
            'You must provide accurate information when registering and keep it up to date. You are responsible for keeping your password confidential and for activity that happens under your account.',
            'Trainer accounts require approval. When you register as a trainer, an administrator reviews the information and documents you submit (including your CV) before your account is activated. Approval may be refused or withdrawn.',
            'You must be old enough to enter a binding contract in your country of residence to use the Service.',
            'You must not create an account using another person’s identity or provide information that is intentionally false, misleading or fraudulent.',
            'If you believe that someone has obtained unauthorised access to your account, you should notify Treyo as soon as reasonably possible.',
        ],
    },

    {
        heading: '3. Courses and content',
        body: [
            'Trainers create courses and submit them for review. An administrator reviews each course, sets its price, and either publishes or rejects it. A course is only visible to learners once approved.',
            'Trainers are responsible for the training materials they upload and confirm they have the right to share them. You may not upload content that infringes the rights of others, is unlawful, or is misleading.',
            'Treyo may remove content or suspend an account that breaches these Terms.',
            'Trainers are responsible for ensuring that the descriptions, qualifications, materials and other information they provide about their courses are accurate and not misleading.',
        ],
    },

    {
        heading: '4. Groups, sessions and attendance',
        body: [
            'Learners express interest in a course. Once enough interest is registered, an administrator forms a training group and the trainer schedules the sessions.',
            'Trainers are expected to deliver the sessions they schedule. Learners are expected to attend the sessions they enroll in. Repeated failure to do so may lead to removal from the platform.',
            'Treyo may modify or reorganise a group where necessary for operational, scheduling, safety or administrative reasons.',
            'Treyo does not guarantee that a particular course, trainer, group or session will always be available.',
        ],
    },

    {
        heading: '5. Payments',
        body: [
            'Course prices are set by Treyo administrators and shown before you enroll.',
            'Payments are processed through ClickToPay by Tunisie Monétique. Treyo does not store complete payment-card details.',
            'Payment processing may be subject to the terms, privacy practices and security requirements of the payment provider.',
            'Trainer compensation is agreed separately with Treyo and is not part of the price you pay as a learner.',
            'At the current stage of the Service, Treyo does not offer a general refund policy. Any exceptional refund request may be reviewed individually by Treyo where appropriate or where required by applicable law.',
        ],
    },

    {
        heading: '6. Acceptable use',
        body: [
            'You agree not to:',
            '• harass, abuse or impersonate other users;',
            '• post unlawful, misleading, or infringing content;',
            '• attempt to gain unauthorised access to the Service or other accounts;',
            '• use the Service to send spam or unsolicited advertising;',
            '• interfere with the normal operation of the Service;',
            '• attempt to circumvent security, authentication or access-control mechanisms;',
            '• use the Service for fraudulent, deceptive or unlawful purposes;',
            '• upload malicious software, code or files;',
            '• use the Service to distribute content that violates applicable law or the rights of others.',
            'You can report a trainer from their profile. Reports are reviewed confidentially by our administrators.',
        ],
    },

    {
        heading: '7. Reviews and reports',
        body: [
            'Reviews must reflect genuine experience. Administrators may hide a review that breaches these Terms; the underlying rating may still count toward averages.',
            'Submitting knowingly false reports may itself lead to action against your account.',
            'Reviews should not contain personal information belonging to another person, unlawful material, harassment, threats or discriminatory content.',
            'Treyo may review reported content and take appropriate action, including removing content, limiting visibility or suspending an account.',
        ],
    },

    {
        heading: '8. Availability and changes',
        body: [
            'We may change, suspend or discontinue parts of the Service. We aim to give reasonable notice of significant changes, but the Service is provided on an "as available" basis.',
            'We may update these Terms. Continued use after an update means you accept the revised Terms.',
        ],
    },

    {
        heading: '9. Termination',
        body: [
            'You may stop using the Service at any time and request deletion of your account.',
            'We may suspend or close an account that breaches these Terms or where required by law.',
            'We may also restrict access temporarily where necessary to protect the Service, investigate suspected abuse, prevent fraud or comply with legal obligations.',
            'Account termination does not automatically remove information that Treyo is legally required to retain.',
        ],
    },

    {
        heading: '10. Liability',
        body: [
            'Treyo connects learners and trainers; it does not itself deliver the training. To the extent permitted by law, Treyo is not liable for the quality or outcome of any individual course.',
            'Nothing in these Terms excludes liability that cannot lawfully be excluded.',
        ],
    },

    {
        heading: '11. Intellectual property',
        body: [
            'Trainers remain responsible for the intellectual-property rights associated with the original course materials they upload and must have the necessary rights or permissions to make those materials available through Treyo.',
            'By uploading course materials or other content to the Service, you grant Treyo the limited permission necessary to host, store, display and make that content available through the Service for the purposes for which it was submitted.',
            'You must not upload content belonging to another person or organisation unless you have the necessary rights or permission.',
            'Treyo and its licensors retain rights in the Treyo application, software, interface, branding, logos, databases, design and other platform materials, except where otherwise stated.',
        ],
    },

    {
        heading: '12. Account deletion',
        body: [
            'You may request deletion of your Treyo account through the account-management functionality provided in the application or by contacting us at the address provided below.',
            'When an account is deleted, Treyo will remove or anonymise personal information where reasonably possible, subject to information that must be retained for legal, accounting, security, fraud-prevention or dispute-resolution purposes.',
            'Some content may need to be retained in anonymised or aggregated form, for example statistical information that can no longer reasonably be associated with you.',
            'Deleting your account does not necessarily cancel obligations that arose before deletion, including payment-related obligations where applicable.',
        ],
    },

    {
        heading: '13. Governing law and jurisdiction',
        body: [
            'These Terms are governed by the applicable laws of the Republic of Tunisia, without prejudice to mandatory consumer-protection or other legal rights that may apply to you under the laws of your country of residence.',
            'Any dispute relating to the Service will be subject to the competent courts in Tunisia, unless mandatory applicable law provides otherwise.',
            'Where European Union or European Economic Area law applies to a user or transaction, nothing in this section is intended to remove mandatory rights or protections that cannot legally be excluded.',
        ],
    },

    {
        heading: '14. Contact',
        body: [
            `Treyo is operated by ${LEGAL_ENTITY_NAME}.`,
            `Address: ${LEGAL_ENTITY_ADDRESS}`,
            `Country: ${LEGAL_ENTITY_COUNTRY}`,
            `Questions about these Terms: ${LEGAL_CONTACT_EMAIL}`,
        ],
    },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
    {
        heading: '1. Who we are',
        body: [
            'Treyo ("we", "us" or "our") is operated by LeanConsulting, a Tunisian enterprise.',
            `Contact address: ${LEGAL_ENTITY_ADDRESS}`,
            'This Privacy Policy explains what personal data we collect, why we use it, how it may be shared, how long we keep it, and what rights you may have.',
            'Treyo processes personal data in accordance with applicable Tunisian data-protection legislation, including the applicable framework governing the protection of personal data in Tunisia.',
            'Where the European Union General Data Protection Regulation (GDPR) or another data-protection law applies to a particular user or processing activity, Treyo will comply with the requirements that are legally applicable to that processing.',
        ],
    },

    {
        heading: '2. Data we collect',
        body: [
            'Account data — your name, email address, password (stored only as a secure hash, never in readable form), and optionally your phone number, city and profile picture.',
            'Learner profile — education level, field of study, interests, domains and skills you want to learn. We use this to recommend relevant courses.',
            'Trainer profile — biography, specializations, skills, years of experience, education, professional links, and the CV you upload for approval.',
            'Usage data — courses you view, search, favourite, request or enroll in, and your search queries. This is what powers personalised recommendations.',
            'Communications — messages you send in group conversations, and reviews or reports you submit.',
            'Device data — a push notification token, so we can notify you about approvals, group formation and new messages.',
            'Technical and security information — information that may be generated when you use the Service, such as authentication information, security logs, error information and information necessary to maintain and protect the Service.',
        ],
    },

    {
        heading: '3. Why we use it',
        body: [
            '• to create and secure your account, and to authenticate you;',
            '• to operate the platform: approvals, course publication, group formation, scheduling, messaging;',
            '• to personalise course recommendations from your profile and activity;',
            '• to process payments for course enrollment;',
            '• to send service messages (email verification, password reset, approval decisions) and push notifications;',
            '• to moderate the platform — reviewing reports, reviews and reported content;',
            '• to understand overall usage and improve the Service;',
            '• to detect, prevent and investigate fraud, abuse, security incidents and violations of our Terms;',
            '• to comply with applicable legal and regulatory obligations;',
            '• to establish, exercise or defend legal claims where necessary.',
        ],
    },

    {
        heading: '4. Automated recommendations',
        body: [
            'We rank courses for you using your declared interests and domains, your past interactions and searches, and patterns from learners with similar activity.',
            'This affects only what is suggested to you. It does not make decisions with legal or similarly significant effects, and you can use search and browsing instead of the recommendations at any time.',
            'The recommendation system is intended to help users discover relevant training opportunities. It does not determine whether you are accepted into a course, approved as a trainer, or otherwise entitled to a legal or similarly significant outcome.',
        ],
    },

    {
        heading: '5. Who we share it with',
        body: [
            'Payment provider — ClickToPay by Tunisie Monétique is used to process course payments. The payment provider receives the information necessary to process the transaction. Treyo does not store complete payment-card details.',
            'Cloud and hosting provider — OxaHost, a Tunisian provider of hosting and cloud solutions, currently provides the hosting infrastructure used by the Service. Data processed through this infrastructure may include information necessary to operate the application, backend services and databases.',
            'Push notification provider — receives your device token and the notification text in order to deliver notifications.',
            'Email provider — used to send verification, password reset and approval emails.',
            'Other users — your public profile (name, picture, and for trainers your bio, specializations and rating) is visible to other users. Messages you post in a group are visible to that group and to administrators.',
            'Administrators — can see account details, submitted courses, reviews, and any report naming you, in order to moderate the platform.',
            'Service providers — we may use technical service providers that process information on our behalf where necessary to operate, secure, maintain or improve the Service.',
            'We do not sell your personal data.',
        ],
    },

    {
        heading: '6. AI-generated content',
        body: [
            'The daily tips and highlights on your home feed are generated by a third-party AI service. The same content is generated for everyone: we do not send your personal data to that service to produce it.',
            'Treyo will not intentionally provide your profile, account information, private messages, payment information or other personal information to the AI service for the generation of these general daily tips and highlights.',
        ],
    },

    {
        heading: '7. International data transfers',
        body: [
            'Treyo and its service providers may process or store information using infrastructure located in Tunisia or, where applicable, in other countries.',
            'Where personal data is transferred across national borders, Treyo will seek to use appropriate safeguards and comply with applicable Tunisian data-protection requirements and, where applicable, requirements governing international transfers under the GDPR or other applicable data-protection laws.',
            'The exact location of processing may depend on the infrastructure and third-party services used by Treyo at a particular time.',
        ],
    },

    {
        heading: '8. Data retention',
        body: [
            'We keep your account data for as long as your account exists.',
            'Moderation records (reports and their outcomes) are kept longer so decisions remain auditable and to protect the Service against abuse.',
            'Payment and transaction-related records may be retained for the period required by applicable accounting, tax, financial or other legal obligations.',
            'Security logs and technical records may be retained for as long as reasonably necessary to maintain security, investigate incidents and protect the Service.',
            'When you ask us to delete your account, we remove or anonymise your personal data except where we must keep records to meet legal, accounting, security, fraud-prevention or dispute-resolution obligations.',
        ],
    },

    {
        heading: '9. Security',
        body: [
            'Passwords are stored using a one-way hash. Access to the platform is authenticated with signed tokens, and administrative functions are restricted to administrator accounts.',
            'No system is perfectly secure, but we take reasonable technical and organisational measures to protect your data.',
            'These measures may include access controls, authentication mechanisms, secure password storage, administrative restrictions, monitoring and other security practices appropriate to the Service.',
            'If we become aware of a personal-data security incident requiring notification under applicable law, we will take the measures required by that law.',
        ],
    },

    {
        heading: '10. Messaging and moderation',
        body: [
            'Treyo provides internal messaging and group communication features.',
            'Messages you send in a group are visible to members of that group and to authorised administrators where necessary for moderation, security or platform administration.',
            'Users must not use messaging features to send unlawful, threatening, abusive, harassing, discriminatory, fraudulent or otherwise prohibited content.',
            'Users can report inappropriate trainers, content or behaviour. Treyo may review reports and associated information to investigate potential violations and take appropriate action.',
            'Treyo may remove messages or restrict accounts where necessary to enforce the Terms, protect users, maintain security or comply with applicable law.',
        ],
    },

    {
        heading: '11. Your rights',
        body: [
            'Depending on where you live and which law applies to the processing of your personal data, you may have the right to:',
            '• access the personal data we hold about you;',
            '• correct inaccurate data — most of it is editable directly in the app;',
            '• request deletion of your account and personal data;',
            '• object to or restrict certain processing;',
            '• receive a copy of your data in a portable format where applicable;',
            '• withdraw consent where processing is based on consent;',
            '• lodge a complaint with the competent data-protection authority where you believe your rights have been violated.',
            `To exercise any of these rights, contact ${LEGAL_CONTACT_EMAIL}.`,
            'We may need to verify your identity before completing certain requests in order to protect your account and personal information.',
        ],
    },

    {
        heading: '12. Account deletion',
        body: [
            'You can request deletion of your Treyo account through the account-management functionality provided in the application or by contacting us at the email address provided in this policy.',
            'When an account is deleted, Treyo will remove or anonymise personal information where reasonably possible, except where retention is required or permitted by applicable law.',
            'Some information may remain in backups or security records for a limited period before being securely overwritten, where technically necessary.',
            'Information that has been anonymised so that it can no longer reasonably be associated with you may be retained for statistical, analytical or operational purposes.',
        ],
    },

    {
        heading: '13. Children',
        body: [
            'The Service is not intended for children below the age at which they can consent to online services in their country. We do not knowingly collect their data.',
            'If you believe that a child has provided personal data to Treyo in violation of applicable requirements, please contact us so that we can review the situation and take appropriate action.',
        ],
    },

    {
        heading: '14. Changes',
        body: [
            'We may update this policy. Where changes are significant we will make them visible in the app.',
            'The "Last Updated" date at the beginning of this policy indicates when the current version became effective.',
            'Where required by applicable law, we will provide additional notice or obtain consent for material changes to the way personal data is processed.',
        ],
    },

    {
        heading: '15. Contact',
        body: [
            `Treyo is operated by ${LEGAL_ENTITY_NAME}.`,
            `Address: ${LEGAL_ENTITY_ADDRESS}`,
            `Country: ${LEGAL_ENTITY_COUNTRY}`,
            `Questions or requests about your data: ${LEGAL_CONTACT_EMAIL}`,
        ],
    },
];