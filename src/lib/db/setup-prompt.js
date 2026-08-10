// The prompt a studio copies into an assistant.
//
// Built here rather than written out in a message file, so the schema it
// describes and the schema the parser enforces come from the same constants. A
// prompt that drifts from its parser produces documents that are refused for
// reasons nobody can see, and the person reading the refusals has no way to know
// the instructions were the stale half.
//
// It is deliberately blunt about what to leave out. An assistant asked to read a
// price list will fill gaps helpfully, and helpful invention is the failure mode
// this whole flow is built around.

import { PACKAGE_KINDS, SETUP_FORMAT, VALIDITY_STARTS } from './import.js';

/** A worked example, so the shape is shown rather than only described. */
const EXAMPLE = {
	format: SETUP_FORMAT,
	source: 'https://example.org/prices/',
	locations: [
		{
			name: { de: 'Studio Altstadt', en: 'Old Town Studio' },
			address: 'Hauptstraße 1, 12345 Musterstadt'
		}
	],
	packages: [
		{
			name: { de: '10er-Karte', en: '10-class pass' },
			kind: 'ten',
			priceEUR: 175,
			units: 10,
			validityDays: 365,
			validityStart: 'issue'
		},
		{
			name: { de: 'Monatskarte', en: 'Monthly pass' },
			kind: 'month',
			priceEUR: 120,
			units: null,
			validityDays: 30,
			validityStart: 'issue'
		}
	],
	courses: [
		{
			mode: 'recurring',
			locationId: 'studio-altstadt',
			title: { de: 'Hatha Yoga', en: 'Hatha Yoga' },
			weekday: 1,
			time: '18:00',
			durationMin: 90,
			capacity: 20
		}
	]
};

const RULES = {
	de: [
		`Antworte mit **einem einzigen JSON-Dokument und sonst nichts** — kein einleitender Satz, keine Erklärung danach.`,
		`\`format\` muss exakt \`"${SETUP_FORMAT}"\` lauten. \`source\` ist die Adresse, aus der du gelesen hast.`,
		`Erfinde nichts. Was auf der Seite nicht steht, lässt du weg — ein fehlendes Feld ist gut, ein geratenes ist ein Fehler, der später Geld kostet.`,
		`Preise als Zahl in Euro: \`175\` bedeutet einhundertfünfundsiebzig Euro. Rechne niemals um und erfinde kein Komma.`,
		`Gibt es für dieselbe Karte mehrere Preise (ermäßigt, Studierende, mit Förderbeitrag), lege sie als getrennte Karten an und schreibe die Stufe in den Namen.`,
		`\`units\` ist die Anzahl der Besuche, oder \`null\` bei einer Zeitkarte. \`validityDays\` ist die Gültigkeit in Tagen, oder \`null\`. Mindestens eins von beiden muss gesetzt sein.`,
		`Kannst du nicht entscheiden, ob etwas eine Karte ist — etwa „Workshop: 22 € oder 1 Streifen" — dann lass es weg.`,
		`\`kind\` ist eines von: ${PACKAGE_KINDS.join(', ')}. \`validityStart\` ist ${VALIDITY_STARTS.join(' oder ')}.`,
		`\`weekday\`: 0 = Sonntag bis 6 = Samstag. \`time\` als \`"HH:MM"\`. \`locationId\` ist der Name des Standorts in Kleinbuchstaben mit Bindestrichen.`,
		`\`capacity\` (Plätze) nur, wenn die Seite es nennt. Steht es nirgends, lass das Feld weg — das Studio trägt die Zahl selbst nach.`,
		`Lehrernamen, Retreats, Ausbildungen und Online-Angebote gehören **nicht** hinein.`
	],
	en: [
		`Reply with **a single JSON document and nothing else** — no sentence before it, no explanation after.`,
		`\`format\` must be exactly \`"${SETUP_FORMAT}"\`. \`source\` is the address you read from.`,
		`Invent nothing. Leave out whatever the page does not state — a missing field is fine, a guessed one is a mistake that costs money later.`,
		`Prices as a number in euro: \`175\` means one hundred and seventy-five euro. Never convert, never add a decimal point.`,
		`Where one pass has several prices (reduced, students, with a membership), make them separate passes and put the tier in the name.`,
		`\`units\` is the number of visits, or \`null\` for a time pass. \`validityDays\` is the validity in days, or \`null\`. At least one of the two must be set.`,
		`If you cannot decide whether something is a pass — such as "Workshop: €22 or one strip off a card" — leave it out.`,
		`\`kind\` is one of: ${PACKAGE_KINDS.join(', ')}. \`validityStart\` is ${VALIDITY_STARTS.join(' or ')}.`,
		`\`weekday\`: 0 = Sunday through 6 = Saturday. \`time\` as \`"HH:MM"\`. \`locationId\` is the location name in lowercase with hyphens.`,
		`\`capacity\` (places) only where the page states it. If it does not, leave the field out — the studio fills that number in itself.`,
		`Teacher names, retreats, teacher trainings and online-only offerings do **not** belong in it.`
	]
};

const HEADING = {
	de: (/** @type {string} */ url) =>
		`Lies die Yoga-Website ${url} — insbesondere Preisliste und Stundenplan — und übertrage Standorte, Karten und Kurse in das unten beschriebene Format.`,
	en: (/** @type {string} */ url) =>
		`Read the yoga website ${url} — its price list and timetable in particular — and transfer the locations, passes and courses into the format described below.`
};

const EXAMPLE_LABEL = {
	de: 'Beispiel für die erwartete Form:',
	en: 'Example of the expected shape:'
};

/**
 * @param {object} options
 * @param {string} options.url the studio's own website
 * @param {'de' | 'en'} [options.locale]
 * @returns {string} ready to paste into an assistant
 */
export function buildSetupPrompt({ url, locale = 'de' }) {
	const language = locale === 'en' ? 'en' : 'de';
	const address = url.trim() || (language === 'en' ? '<your website>' : '<eure Website>');

	const rules = RULES[language].map((rule, index) => `${index + 1}. ${rule}`).join('\n');

	return [
		HEADING[language](address),
		'',
		rules,
		'',
		EXAMPLE_LABEL[language],
		'',
		JSON.stringify(EXAMPLE, null, 2)
	].join('\n');
}
