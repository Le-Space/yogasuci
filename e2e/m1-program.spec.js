// M1 — registry and programme (T1.1, T1.2).
//
// The acceptance criteria come straight from docs/PLAN.md: Alice creates two
// locations, three open classes, one series (twice weekly over five weeks with
// one date struck) and five packages; bilingual; and all of it survives a
// reload.

import {
	expect,
	onboard as onboardVia,
	openCourseForm,
	openPackageForm,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('registry and programme', () => {
	test('Alice sets up a studio and it survives a reload', async ({ alice }) => {
		test.setTimeout(240_000);

		await onboard(alice);

		// --- studio and two locations -------------------------------------
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await addLocation(alice, { id: 'altstadt', de: 'Studio Altstadt', en: 'Old Town Studio' });
		await addLocation(alice, { id: 'west', de: 'Studio West', en: 'West Studio' });

		await expect(alice.getByTestId('location-item')).toHaveCount(2);

		// The owner DID is what every later signature is verified against, so it
		// has to be real rather than a placeholder.
		await expect(alice.getByTestId('owner-did')).toContainText('did:');

		// --- three open classes -------------------------------------------
		await alice.goto('/program/');
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		await addRecurringCourse(alice, {
			id: 'vinyasa-mi-18',
			location: 'location:altstadt',
			de: 'Vinyasa Flow',
			en: 'Vinyasa Flow',
			weekday: '3'
		});
		await addRecurringCourse(alice, {
			id: 'hatha-mo-09',
			location: 'location:altstadt',
			de: 'Hatha Morgen',
			en: 'Morning Hatha',
			weekday: '1'
		});
		await addRecurringCourse(alice, {
			id: 'yin-fr-19',
			location: 'location:west',
			de: 'Yin Yoga',
			en: 'Yin Yoga',
			weekday: '5'
		});

		await expect(alice.getByTestId('course-item')).toHaveCount(3);

		// --- one series, twice weekly, five weeks, one date struck ---------
		await openCourseForm(alice);
		await alice.getByTestId('course-mode').selectOption('series');
		await alice.getByTestId('course-id').fill('anfaenger-h26');
		await alice.getByTestId('course-location').selectOption('location:altstadt');
		await alice.getByTestId('course-title-de').fill('Anfängerkurs Herbst');
		await alice.getByTestId('course-title-en').fill('Beginners course, autumn');
		await alice.getByTestId('course-price').fill('95');

		await alice.getByTestId('series-start').fill('2026-09-08');
		await alice.getByTestId('series-weeks').fill('5');
		// Tuesday and Thursday; the default already selects them, so assert rather
		// than click blindly.
		await expect(alice.getByTestId('series-weekday-2')).toHaveAttribute('aria-pressed', 'true');
		await expect(alice.getByTestId('series-weekday-4')).toHaveAttribute('aria-pressed', 'true');

		await alice.getByTestId('series-generate').click();
		await expect(alice.getByTestId('series-session')).toHaveCount(10);

		// Strike a holiday. The series must get shorter, not roll into a sixth week.
		await alice.getByTestId('series-drop-2026-09-24').click();
		await expect(alice.getByTestId('series-session')).toHaveCount(9);

		await alice.getByTestId('course-add').click();

		const series = alice.locator(
			'[data-testid="course-item"][data-course-id="course:anfaenger-h26"]'
		);
		await expect(series).toBeVisible();
		await expect(series).toHaveAttribute('data-sessions', '9');
		await expect(series).toHaveAttribute('data-mode', 'series');

		// --- five packages -------------------------------------------------
		await addPackage(alice, { id: 'einzel', de: 'Einzelkarte', kind: 'single', units: '1' });
		await addPackage(alice, { id: 'woche', de: 'Wochenkarte', kind: 'week', units: '' });
		await addPackage(alice, { id: 'zehner', de: '10er-Karte', kind: 'ten', units: '10' });
		await addPackage(alice, { id: 'monat', de: 'Monatskarte', kind: 'month', units: '' });
		await addPackage(alice, { id: 'jahr', de: 'Jahreskarte', kind: 'year', units: '' });

		await expect(alice.getByTestId('package-item')).toHaveCount(5);

		// --- persistence (T1.1) ---------------------------------------------
		// A reload must not cost a WebAuthn interaction and must not lose data:
		// the blockstore is on IndexedDB and the database address is remembered.
		await alice.reload();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		await expect(alice.getByTestId('course-item')).toHaveCount(4);
		await expect(alice.getByTestId('package-item')).toHaveCount(5);
		await expect(
			alice.locator('[data-testid="course-item"][data-course-id="course:anfaenger-h26"]')
		).toHaveAttribute('data-sessions', '9');

		await alice.goto('/studio/');
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await expect(alice.getByTestId('studio-name')).toHaveValue('Yoga Eggenfelden');
		await expect(alice.getByTestId('location-item')).toHaveCount(2);
	});

	test('content is bilingual and follows the language switch', async ({ alice }) => {
		test.setTimeout(180_000);

		await onboard(alice);
		await addLocation(alice, { id: 'altstadt', de: 'Studio Altstadt', en: 'Old Town Studio' });

		// Set the language rather than assume it: the app follows the device, and
		// the test browser is en-US. Content fields are `{ de, en }` objects, so
		// the switch has to move the *data*, not just the chrome.
		await alice.getByTestId('language-de').click();
		await expect(alice.getByTestId('location-item')).toContainText('Studio Altstadt');

		await alice.getByTestId('language-en').click();
		await expect(alice.getByTestId('location-item')).toContainText('Old Town Studio');

		// Falling back rather than rendering nothing is the rule from §7: a
		// location saved with only a German label still has to show up.
		await addLocation(alice, { id: 'west', de: 'Studio West', en: '' });
		await expect(alice.locator('[data-location-id="location:west"]')).toContainText('Studio West');
	});

	test('the studio survives a detour through the connection screen', async ({ alice }) => {
		test.setTimeout(240_000);

		// Regression: /connect used to start and stop the node itself, so leaving
		// it tore down the databases the studio screens were holding — while the
		// gate still reported "ready". The editor rendered over closed databases
		// and the next write failed with "the registry is not open".
		await onboard(alice);
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await alice.goto('/connect/?ice=host');
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		await alice.goto('/studio/');
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		// The real proof is a *write* going through, not just the screen showing.
		await addLocation(alice, { id: 'west', de: 'Studio West', en: 'West Studio' });
		await expect(alice.getByTestId('studio-error')).toHaveCount(0);
	});

	test('the id fields actually refuse an id they cannot accept', async ({ alice }) => {
		test.setTimeout(180_000);

		// Written against `validity`, not against a red outline, because the way
		// this broke is invisible from the outside: browsers now compile the
		// `pattern` attribute with the `v` flag, where a bare `-` inside a
		// character class is a syntax error. A pattern that does not compile is
		// *ignored* - the field then accepts everything and looks entirely normal,
		// while the console carries one line nobody reads.
		//
		// So the assertion is that an invalid value is genuinely rejected. Against
		// an uncompilable pattern, patternMismatch is false for every input, and
		// this fails.
		await onboard(alice);

		const field = alice.getByTestId('location-id');
		const mismatch = () => field.evaluate((/** @type {any} */ el) => el.validity.patternMismatch);

		await field.fill('Studio West');
		expect(await mismatch()).toBe(true);

		// ...and still accepts the ids the app actually uses, hyphen included -
		// escaping the wrong character would trade one silent failure for another.
		await field.fill('studio-west');
		expect(await mismatch()).toBe(false);
	});

	test('a deactivated location stays in the registry', async ({ alice }) => {
		test.setTimeout(180_000);

		await onboard(alice);
		await addLocation(alice, { id: 'altstadt', de: 'Studio Altstadt', en: 'Old Town Studio' });

		await alice.getByTestId('location-deactivate').click();

		// Deactivated, not deleted: signed ticket events reference this location
		// and the cash report is grouped by it.
		const location = alice.locator('[data-location-id="location:altstadt"]');
		await expect(location).toBeVisible();
		await expect(location).toHaveAttribute('data-active', 'false');
	});

	test('shows one list at a time, today first', async ({ alice }) => {
		// The lists used to sit under each other, so a phone had to scroll past a
		// whole programme to reach the prices. Today is the default now: what the
		// screen is named after is an argument about the name, and somebody
		// standing in the doorway wants the class that is on (#76).
		test.setTimeout(240_000);

		await onboard(alice);
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await alice.getByTestId('nav-program').click();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		await expect(alice.getByTestId('tab-today')).toHaveAttribute('aria-selected', 'true');
		await expect(alice.getByTestId('course-list')).toBeHidden();

		await alice.getByTestId('tab-courses').click();

		await expect(alice.getByTestId('tab-courses')).toHaveAttribute('aria-selected', 'true');
		await expect(alice.getByTestId('course-list')).toBeVisible();
		await expect(alice.getByTestId('package-list')).toBeHidden();

		await alice.getByTestId('tab-packages').click();

		await expect(alice.getByTestId('package-list')).toBeVisible();
		await expect(alice.getByTestId('course-list')).toBeHidden();

		// Hidden, not gone. Both panels stay in the document so a half-typed course
		// survives a stray tab click — and so `aria-controls` keeps pointing at
		// something that exists, which is what axe checks on this screen.
		await expect(alice.getByTestId('course-list')).toHaveCount(1);
	});
});

/** @param {import('@playwright/test').Page} page */
async function onboard(page) {
	await page.goto('/studio/');

	await expect(page.getByTestId('onboarding')).toBeVisible(READY);
	await page.getByTestId('onboarding-user-id').fill('Alice');
	await page.getByTestId('onboarding-submit').click();

	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, de: string, en: string }} location
 */
async function addLocation(page, { id, de, en }) {
	await page.getByTestId('location-id').fill(id);
	await page.getByTestId('location-name-de').fill(de);
	await page.getByTestId('location-name-en').fill(en);
	await page.getByTestId('location-add').click();

	await expect(page.locator(`[data-location-id="location:${id}"]`)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, location: string, de: string, en: string, weekday: string }} course
 */
async function addRecurringCourse(page, { id, location, de, en, weekday }) {
	await openCourseForm(page);
	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill(id);
	await page.getByTestId('course-location').selectOption(location);
	await page.getByTestId('course-title-de').fill(de);
	await page.getByTestId('course-title-en').fill(en);
	await page.getByTestId('course-weekday').selectOption(weekday);
	await page.getByTestId('course-add').click();

	await expect(
		page.locator(`[data-testid="course-item"][data-course-id="course:${id}"]`)
	).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, de: string, kind: string, units: string }} pkg
 */
async function addPackage(page, { id, de, kind, units }) {
	await openPackageForm(page);
	await page.getByTestId('package-id').fill(id);
	await page.getByTestId('package-name-de').fill(de);
	await page.getByTestId('package-kind').selectOption(kind);
	await page.getByTestId('package-units').fill(units);
	await page.getByTestId('package-add').click();

	await expect(page.locator(`[data-package-id="package:${id}"]`)).toBeVisible();
}

test.describe('taking a programme over from a pasted document', () => {
	test('nothing is written until the review is confirmed', async ({ alice }) => {
		// The whole safety property of #43 in one scenario: a document produced by
		// an assistant reading a website is confidently wrong often enough that it
		// must never write on arrival.
		test.setTimeout(240_000);

		await onboard(alice);
		await alice.getByTestId('studio-name').fill('Sivananda München');
		await alice.getByTestId('studio-save').click();
		await addLocation(alice, {
			id: 'luisenstrasse',
			de: 'Luisenstraße 45',
			en: 'Luisenstrasse 45'
		});

		// The import lives with the programme rather than with the studio: it
		// creates courses and passes, and that is the page those belong to.
		await alice.goto('/program/');

		// Folded shut now. A studio imports once, on its first day, so the panel
		// does not stand open in front of everyone who came to change a price.
		await expect(alice.getByTestId('import-panel')).toBeVisible(READY);
		await expect(alice.getByTestId('import-paste')).not.toBeVisible();

		await alice.getByTestId('import-open').click();
		await expect(alice.getByTestId('import-paste')).toBeVisible(READY);

		// Step 1: the prompt. It goes to the clipboard, carrying the studio's own
		// address — nothing is sent anywhere, which is the point of the design.
		await alice.getByTestId('import-url').fill('https://muenchen.sivananda.yoga/');
		await alice.getByTestId('import-copy-prompt').click();
		await expect(alice.getByTestId('import-prompt-copied')).toBeVisible();

		const prompt = await alice.evaluate(() => navigator.clipboard.readText());
		expect(prompt).toContain('https://muenchen.sivananda.yoga/');
		expect(prompt).toContain('yogasuci/setup/1');

		// Shaped like the real price list at muenchen.sivananda.yoga: one pass that
		// maps cleanly, one that cannot be read as either visits or time — which is
		// what "Workshop: 22 € oder 1 Streifen" reduces to — and a teacher.
		const document = JSON.stringify({
			format: 'yogasuci/setup/1',
			source: 'https://muenchen.sivananda.yoga/preise/',
			packages: [
				{ name: '10er-Karte', kind: 'ten', priceEUR: '175,-€', units: 10, validityDays: 365 },
				{ name: 'Workshop', priceEUR: 22 }
			],
			teachers: [{ name: 'Swami Vishnudevananda' }]
		});

		await alice.getByTestId('import-paste').fill(`Gerne! \`\`\`json\n${document}\n\`\`\``);
		await alice.getByTestId('import-review').click();

		// Reviewed, not written: the package list is untouched at this point.
		await expect(alice.getByTestId('import-row')).toHaveCount(1);
		await expect(alice.getByTestId('package-item')).toHaveCount(0);

		// What it could not take is on screen, with a reason, as prominently as
		// what it could.
		await expect(alice.getByTestId('import-refused')).toContainText('Workshop');
		// The count, not the names: none of them are imported, so which ones they
		// were changes nothing the reader can act on.
		await expect(alice.getByTestId('import-refused')).toContainText('1 teacher');

		// The price it read is offered for checking rather than asserted as fact.
		await expect(alice.getByTestId('import-price')).toHaveValue('175');
		await alice.getByTestId('import-price').fill('155');

		await alice.getByTestId('import-apply').click();

		await expect(alice.getByTestId('package-item')).toHaveCount(1, READY);
		await expect(alice.getByTestId('package-item')).toContainText('155');

		// And it survives a reload, because it went into the programme database
		// rather than into a component's state.
		await alice.reload();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await expect(alice.getByTestId('package-item')).toHaveCount(1, READY);
	});

	test('a pass can be retired without being deleted', async ({ alice }) => {
		// The recovery path for an import that went wrong. A pass cannot be
		// deleted: every ticket ever sold names its packageId, and the cash report
		// reads price and name off the sale rather than off the price list. So it
		// is retired, and the price list keeps it as a record.
		//
		// That the till stops offering it is asserted in m4-tickets, where a
		// student is already connected — the counter form only renders once there
		// is somebody to sell to.
		test.setTimeout(240_000);

		await onboard(alice);
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await alice.getByTestId('nav-program').click();

		await addPackage(alice, { id: 'falsch', de: 'Versehentlich', kind: 'ten', units: '10' });
		await expect(alice.getByTestId('package-item')).toHaveCount(1);

		const wrong = alice.locator('[data-package-id="package:falsch"]');
		await expect(wrong).toHaveAttribute('data-active', 'true');

		await wrong.getByTestId('package-deactivate').click();

		await expect(wrong).toHaveAttribute('data-active', 'false');
		await expect(alice.getByTestId('package-item')).toHaveCount(1);
		await expect(wrong.getByTestId('package-deactivate')).toHaveCount(0);
	});
});

test.describe('a device that belongs to no studio', () => {
	test('is told to pair, not that it is a guest somewhere', async ({ alice }) => {
		// The guest sentence names a studio — "you are viewing this studio as a
		// guest" — and a device that has just been set up is not viewing one. It
		// was shown anyway, because the test behind it was `!canEdit` and an
		// absent studio makes that false just as a stranger's studio does. First
		// thing the screen said to a new device (#84).
		test.setTimeout(240_000);

		await alice.goto('/program/?ice=host');
		await onboardVia(alice, 'newcomer');

		await expect(alice.getByTestId('unpaired-notice')).toBeVisible(READY);
		await expect(alice.getByTestId('guest-notice')).toHaveCount(0);
	});
});
