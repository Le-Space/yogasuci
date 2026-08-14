// Imprint and privacy statement, in both languages.
//
// **Not in Paraglide, and that is a deliberate exception to the rule that every
// string goes through it.** Paraglide messages are interface strings — a button, a
// label, a sentence with a placeholder. A legal document is prose that has to be
// read as a whole, reviewed in a diff, and changed by somebody who is not looking
// at the code. Flattened into JSON keys it becomes unreviewable, and a privacy
// statement nobody can review is worse than none. The texts are still fully
// bilingual and still selected by locale; they simply live where they can be read.
//
// **This is a pro-forma draft, not legal advice.** It states the operator's
// position as given; a lawyer should check it before a studio relies on it.
//
// One thing it does *not* do is claim that nothing at all happens. Two third
// parties see something when the app is used, and both are named below rather than
// left out because they are inconvenient: the IPFS gateway that delivers the bundle
// sees the requesting IP address, and a STUN server sees it when a connection is
// negotiated over the internet. Neither is Le Space, and neither can be switched
// off from here — but a privacy statement that says "no data is processed" while an
// IP address reaches somebody's log is false, and being false is the one thing such
// a document cannot afford.

/** Le Space UG, from the shared site config of Le-Space/landing. */
export const ENTITY = {
	name: 'Le Space UG (haftungsbeschränkt)',
	street: 'Lichtenberg 44',
	city: '84307 Eggenfelden',
	representative: 'Nico Krause',
	register: 'HRB 25885',
	registerCourt: 'Amtsgericht Leipzig',
	vatId: 'DE270240660',
	phone: '+49 / 87 21 / 5 06 49 96',
	email: 'info@le-space.de',
	website: 'https://le-space.de'
};

/**
 * @typedef {object} LegalLink
 * @property {string} label
 * @property {string} href
 */

/**
 * A link is its own field rather than a URL inside a paragraph, because the page
 * renders paragraphs as text: a URL written into one would be readable and not
 * clickable. Rendering the prose as HTML instead would open a needless injection
 * surface for text that is ours anyway.
 *
 * @typedef {object} LegalSection
 * @property {string} heading
 * @property {string[]} paragraphs
 * @property {LegalLink[]} [links]
 */

/** @type {Record<'de' | 'en', { imprint: LegalSection[], privacy: LegalSection[] }>} */
export const LEGAL = {
	de: {
		imprint: [
			{
				heading: 'Angaben gemäß § 5 TMG',
				paragraphs: [
					`${ENTITY.name}\n${ENTITY.street}\n${ENTITY.city}`,
					`Handelsregister: ${ENTITY.register}\nRegistergericht: ${ENTITY.registerCourt}`,
					`Vertreten durch: ${ENTITY.representative}`
				]
			},
			{
				heading: 'Kontakt',
				paragraphs: [`Telefon: ${ENTITY.phone}\nE-Mail: ${ENTITY.email}`],
				links: [{ label: ENTITY.website.replace('https://', ''), href: ENTITY.website }]
			},
			{
				heading: 'Umsatzsteuer-ID',
				paragraphs: [
					`Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: ${ENTITY.vatId}`
				]
			},
			{
				heading: 'Redaktionell verantwortlich',
				paragraphs: [`${ENTITY.representative}\n${ENTITY.street}\n${ENTITY.city}`]
			},
			{
				heading: 'EU-Streitschlichtung',
				paragraphs: [
					'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: https://ec.europa.eu/consumers/odr/',
					'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.'
				]
			},
			{
				heading: 'Softwarenutzung, Gewährleistung und Haftung',
				paragraphs: [
					'Diese Anwendung wird als statisches Programmpaket über IPFS bereitgestellt. Mit dem Laden und Nutzen kommt ein Softwarenutzungsvertrag zwischen Ihnen und der Le Space UG (haftungsbeschränkt) zustande.',
					'Die Nutzung ist unentgeltlich. Zahlungen zwischen einem Studio und seinen Schülern finden ausschließlich bar und außerhalb dieser Software statt; es werden keine Zahlungen über die Anwendung abgewickelt.',
					'Die Software wird ohne Gewähr überlassen. Eine Haftung für Schäden aus der Nutzung — insbesondere für Geräteverlust, Datenverlust, fehlgeschlagene Synchronisation oder Fehlbuchungen — ist ausgeschlossen, soweit gesetzlich zulässig. Unberührt bleibt die Haftung bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit.',
					'Der Grund für diesen Zuschnitt ist technischer Natur: Die Anwendung verarbeitet keine Daten auf Systemen der Le Space UG. Es gibt keinen Server, auf dem Ihre Daten liegen, und damit auch niemanden bei uns, der sie sichern, wiederherstellen oder herausgeben könnte. Sicherungen liegen ausschließlich in Ihrer Hand (siehe „Export" in der Anwendung).'
				]
			}
		],
		privacy: [
			{
				heading: 'Kurzfassung',
				paragraphs: [
					'Diese Anwendung läuft vollständig auf Ihren Geräten. Es gibt keinen Server, keine Cloud, kein Konto und keine Analyse. Ihre Daten verlassen Ihr Gerät nur, wenn Sie es direkt mit einem anderen Gerät verbinden — und gehen dann unmittelbar dorthin.',
					'Die Le Space UG (haftungsbeschränkt) verarbeitet keine personenbezogenen Daten ihrer Nutzer. Es besteht deshalb kein Auftragsverarbeitungsverhältnis mit uns, und es ist kein Auftragsverarbeitungsvertrag zu schließen.'
				]
			},
			{
				heading: 'Wer verantwortlich ist',
				paragraphs: [
					'Für die Daten seiner Schüler ist das jeweilige Yogastudio verantwortlich im Sinne der DSGVO. Studio und Schüler regeln das Verhältnis untereinander; die Le Space UG ist daran nicht beteiligt und erhält keinen Zugriff.',
					'Für die Bereitstellung dieser Website und dieses Impressums ist die Le Space UG verantwortlich.'
				],
				links: [{ label: ENTITY.website.replace('https://', ''), href: ENTITY.website }]
			},
			{
				heading: 'Was trotzdem nach außen sichtbar wird',
				paragraphs: [
					'Zwei Stellen sehen etwas, und beide sind hier genannt, weil eine Datenschutzerklärung, die „es passiert nichts" behauptet, während eine IP-Adresse in einem fremden Protokoll landet, schlicht falsch wäre.',
					'IPFS-Gateway: Die Anwendung wird als Programmpaket über ein öffentliches IPFS-Gateway ausgeliefert. Beim Laden sieht dessen Betreiber Ihre IP-Adresse und den Zeitpunkt. Das betrifft nur das Laden der Software, nicht Ihre Kurs- oder Kartendaten.',
					'STUN-Server: Wird eine Verbindung über das Internet statt im selben Netz aufgebaut, fragt Ihr Gerät einen STUN-Server nach seiner öffentlichen Adresse. Dabei sieht dessen Betreiber diese Adresse. Im Studio, also im selben WLAN, ist das nicht nötig und lässt sich abschalten.',
					'Ein Verbindungscode, den Sie über einen Messenger teilen, enthält Netzwerkadressen Ihres Geräts. Im Studio ist der QR-Code deshalb der bessere Weg — er verlässt den Raum nicht.'
				]
			},
			{
				heading: 'Was auf Ihrem Gerät liegt',
				paragraphs: [
					'Passkey-Kennung und öffentlicher Schlüssel im lokalen Speicher des Browsers; der private Schlüssel bleibt im Authentifikator Ihres Geräts und ist für die Anwendung nicht lesbar.',
					'Die Datenbanken selbst (Programm, Buchungen, Karten) liegen unverschlüsselt in IndexedDB. Wer physischen Zugriff auf ein entsperrtes Gerät hat, kann sie lesen — Sperrbildschirm und Geräteverschlüsselung sind hier wirksamer als alles, was die Anwendung tun könnte.'
				]
			},
			{
				heading: 'Löschung',
				paragraphs: [
					'Die Datenbanken sind append-only: Einträge werden angehängt, nicht überschrieben — daher stimmen die Guthaben. Eine Karte kann storniert werden, ihre Geschichte bleibt lesbar.',
					'Ein Löschverfahren im Sinne von Art. 17 DSGVO ist damit noch nicht abschließend gelöst; das ist im Projekt als offener Punkt vermerkt. Praktisch löscht das Entfernen der Anwendungsdaten auf einem Gerät alles, was dieses Gerät hält.'
				]
			},
			{
				heading: 'Ausführliche technische Fassung',
				paragraphs: [
					'Eine vollständige Aufstellung — welche Felder personenbezogen sind, welche Metadaten trotz Verschlüsselung sichtbar blieben und was noch offen ist — steht im Projektarchiv unter docs/PRIVACY.md.',
					'Dieser Text ist eine Vorabfassung und ersetzt keine Rechtsberatung.'
				]
			}
		]
	},

	en: {
		imprint: [
			{
				heading: 'Information pursuant to Sect. 5 German Telemedia Act (TMG)',
				paragraphs: [
					`${ENTITY.name}\n${ENTITY.street}\n${ENTITY.city}`,
					`Commercial register: ${ENTITY.register}\nRegistration court: ${ENTITY.registerCourt}`,
					`Represented by: ${ENTITY.representative}`
				]
			},
			{
				heading: 'Contact',
				paragraphs: [`Phone: ${ENTITY.phone}\nEmail: ${ENTITY.email}`],
				links: [{ label: ENTITY.website.replace('https://', ''), href: ENTITY.website }]
			},
			{
				heading: 'VAT ID',
				paragraphs: [
					`Sales tax identification number pursuant to Sect. 27 a of the German Sales Tax Act: ${ENTITY.vatId}`
				]
			},
			{
				heading: 'Responsible for editorial content',
				paragraphs: [`${ENTITY.representative}\n${ENTITY.street}\n${ENTITY.city}`]
			},
			{
				heading: 'EU dispute resolution',
				paragraphs: [
					'The European Commission provides a platform for online dispute resolution: https://ec.europa.eu/consumers/odr/',
					'We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.'
				]
			},
			{
				heading: 'Software use, warranty and liability',
				paragraphs: [
					'This application is distributed as a static bundle over IPFS. By loading and using it, a software usage agreement comes about between you and Le Space UG (haftungsbeschränkt).',
					'Use is free of charge. Payments between a studio and its students are made in cash and outside this software; no payment is processed through the application.',
					'The software is provided without warranty. Liability for damage arising from its use — in particular loss of a device, loss of data, failed synchronisation or incorrect bookings — is excluded as far as the law allows. Liability for intent and gross negligence, and for injury to life, body or health, remains unaffected.',
					'The reason for this is technical: the application processes no data on any system of Le Space UG. There is no server holding your data, and therefore nobody here who could back it up, restore it or hand it over. Backups are yours alone to make (see "Export" in the application).'
				]
			}
		],
		privacy: [
			{
				heading: 'In short',
				paragraphs: [
					'This application runs entirely on your devices. There is no server, no cloud, no account and no analytics. Your data leaves your device only when you connect it directly to another device — and then it goes straight there.',
					'Le Space UG (haftungsbeschränkt) processes no personal data of its users. There is therefore no processing relationship with us, and no data processing agreement to be concluded.'
				]
			},
			{
				heading: 'Who is responsible',
				paragraphs: [
					'Each yoga studio is the controller under the GDPR for its students’ data. Studio and student arrange that between themselves; Le Space UG is not a party to it and has no access.',
					'Le Space UG is responsible for providing this website and this imprint.'
				],
				links: [{ label: ENTITY.website.replace('https://', ''), href: ENTITY.website }]
			},
			{
				heading: 'What is nevertheless visible outside',
				paragraphs: [
					'Two parties see something, and both are named here, because a privacy statement claiming "nothing happens" while an IP address reaches somebody else’s log would simply be false.',
					'IPFS gateway: the application is delivered as a bundle through a public IPFS gateway. On loading, its operator sees your IP address and the time. That concerns loading the software only, not your class or pass data.',
					'STUN server: when a connection is made over the internet rather than on the same network, your device asks a STUN server for its public address, and that server’s operator sees it. Inside the studio, on the same Wi-Fi, this is not needed and can be switched off.',
					'A connection code shared through a messenger contains your device’s network addresses. In the studio the QR code is the better route — it does not leave the room.'
				]
			},
			{
				heading: 'What is stored on your device',
				paragraphs: [
					'The passkey identifier and public key in the browser’s local storage; the private key stays in your device’s authenticator and cannot be read by the application.',
					'The databases themselves (programme, bookings, passes) sit unencrypted in IndexedDB. Anyone with physical access to an unlocked device can read them — a lock screen and device encryption do more here than the application could.'
				]
			},
			{
				heading: 'Erasure',
				paragraphs: [
					'The databases are append-only: entries are added, never overwritten, which is why the balances add up. A pass can be voided; its history stays readable.',
					'A complete procedure for erasure under Art. 17 GDPR is therefore not yet settled, and is recorded in the project as open. In practice, removing the application’s data on a device deletes everything that device holds.'
				]
			},
			{
				heading: 'The full technical account',
				paragraphs: [
					'A complete account — which fields are personal data, which metadata stays visible despite encryption, and what is still open — is in the project repository at docs/PRIVACY.md.',
					'This text is a preliminary draft and is not legal advice.'
				]
			}
		]
	}
};
