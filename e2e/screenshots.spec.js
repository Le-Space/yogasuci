// Pictures for the handbook, taken from the running app.
//
// Run with `pnpm run screenshots`; excluded from the normal suite, because this
// asserts almost nothing and writes files into docs-site/. It is a generator that
// happens to be written as a test.
//
// Why not hand-made images: a handbook whose screenshots are photographed once
// starts lying the first time a button moves, and nothing tells anybody. These are
// produced by driving the same flows the E2E suite drives, so a screen that
// changed either shows up here or breaks a test on the way.
//
// The few assertions are load-bearing all the same: each one waits for the state
// the picture is supposed to show. Without them a screenshot is a race, and a
// blank panel photographed at the wrong moment is worse than no picture at all.

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { test, expect, connectViaPaste, onboard } from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

/** de-DE → de: the handbook's locales are two letters. */
const LOCALE = (process.env.SCREENSHOT_LOCALE ?? 'de-DE').slice(0, 2);
const OUT = fileURLToPath(new URL(`../docs-site/static/img/screens/${LOCALE}/`, import.meta.url));

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function shoot(page, name) {
	await mkdir(OUT, { recursive: true });
	// Two places carry a clock — the sync strip and the "as of" line on a ticket —
	// so a full-page shot would differ on every run and land as a diff in every
	// commit. Cropping them out is not an option, since both are part of what the
	// handbook explains, so they are frozen to a dash instead. The colon stays: the
	// sentence has to still read like a sentence.
	await page.evaluate(() => {
		const clocks = document.querySelectorAll(
			'[data-testid="sync-oldest"], [data-testid="ticket-as-of"]'
		);
		for (const node of clocks) {
			node.textContent = node.textContent?.replace(/\d[\d./:, ]{6,}/, '—') ?? '';
		}
	});
	await page.screenshot({ path: `${OUT}${name}.png` });
}

test('the screens the handbook talks about', async ({ alice, bob, carol }) => {
	test.setTimeout(900_000);

	// --- The front door ----------------------------------------------------
	await alice.goto('/?ice=host');
	await expect(alice.getByTestId('start-paths')).toBeVisible();
	await shoot(alice, 'start');

	// --- Setting up --------------------------------------------------------
	await alice.goto('/studio/?ice=host');
	await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
	await shoot(alice, 'onboarding');

	await onboard(alice, 'alice');
	await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await alice.getByTestId('studio-save').click();
	await alice.getByTestId('location-id').fill('altstadt');
	await alice.getByTestId('location-name-de').fill('Studio Altstadt');
	await alice.getByTestId('location-name-en').fill('Old Town Studio');
	await alice.getByTestId('location-add').click();
	await expect(alice.locator('[data-location-id="location:altstadt"]')).toBeVisible();

	await alice.getByTestId('location-id').fill('west');
	await alice.getByTestId('location-name-de').fill('Studio West');
	await alice.getByTestId('location-name-en').fill('Studio West');
	await alice.getByTestId('location-add').click();
	await expect(alice.locator('[data-location-id="location:west"]')).toBeVisible();

	// The second-device demand is on screen at this point, which is the moment the
	// handbook tells somebody not to skip it.
	await expect(alice.getByTestId('second-device-warning')).toBeVisible();
	await shoot(alice, 'studio');

	// --- Programme and prices ----------------------------------------------
	await alice.getByTestId('nav-program').click();
	await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
	await alice.getByTestId('package-id').fill('zehner');
	await alice.getByTestId('package-name-de').fill('10er-Karte');
	await alice.getByTestId('package-name-en').fill('10-class pass');
	await alice.getByTestId('package-kind').selectOption('ten');
	await alice.getByTestId('package-units').fill('10');
	await alice.getByTestId('package-validity-days').fill('30');
	await alice.getByTestId('package-add').click();
	await expect(alice.locator('[data-package-id="package:zehner"]')).toBeVisible();

	await alice.getByTestId('course-mode').selectOption('recurring');
	await alice.getByTestId('course-id').fill('vinyasa-mi-18');
	await alice.getByTestId('course-location').selectOption('location:altstadt');
	await alice.getByTestId('course-title-de').fill('Vinyasa Flow');
	await alice.getByTestId('course-title-en').fill('Vinyasa Flow');
	await alice.getByTestId('course-add').click();
	await expect(alice.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible();
	await shoot(alice, 'programme');

	// --- Connecting ---------------------------------------------------------
	// Photographed *without* `?ice=host`, unlike the rest of this run. That flag
	// drops the readiness panel to two rows, and a picture in the handbook showing
	// a state no visitor ever reaches is worse than a slower screenshot. The rows
	// render when the panel is built, before any probe resolves, so this does not
	// make the picture depend on a STUN server answering.
	await bob.goto('/connect/');
	await onboard(bob, 'bob');
	await expect(bob.getByTestId('qr-image')).toBeVisible(READY);
	await expect(bob.getByTestId('network-status').locator('.line')).toHaveCount(5, READY);
	await shoot(bob, 'connect');

	// Back to host-only for the handshake itself, which is what the rest of the
	// run depends on and what must not wait on the network.
	await bob.goto('/connect/?ice=host');
	await expect(bob.getByTestId('qr-image')).toBeVisible(READY);

	await connectViaPaste(alice, bob);
	await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

	const bobDid = await bob.evaluate(() => window.__yoga.identity());

	// --- The till -----------------------------------------------------------
	await alice.getByTestId('nav-till').click();
	await expect(alice.getByTestId('till-student')).toBeVisible(REPLICATED);
	await alice.getByTestId('till-student').selectOption(bobDid);
	await alice.getByTestId('till-package').selectOption('package:zehner');
	await shoot(alice, 'till');

	await alice.getByTestId('till-sell').click();
	await expect(alice.getByTestId('till-sold')).toBeVisible();

	// --- The student's passes ------------------------------------------------
	await bob.getByTestId('nav-tickets').click();
	await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);
	await shoot(bob, 'passes');

	// --- Check-in ------------------------------------------------------------
	await alice.getByTestId('nav-checkin').click();
	await alice.getByTestId('checkin-student').selectOption(bobDid);
	await alice.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
	await expect(alice.getByTestId('checkin-redeem').first()).toBeEnabled(REPLICATED);
	await shoot(alice, 'checkin');

	await alice.getByTestId('checkin-redeem').first().click();
	await expect(alice.getByTestId('checkin-done')).toBeVisible();

	// --- The cash report ------------------------------------------------------
	await alice.getByTestId('nav-report').click();
	await expect(alice.getByTestId('cash-report')).toBeVisible(REPLICATED);
	await shoot(alice, 'report');

	// --- What a student sees instead ------------------------------------------
	// Photographed on Bob rather than described: the navigation is four entries
	// shorter here, and that is easier to see than to explain.
	await bob.getByTestId('nav-program').click();
	await expect(bob.getByTestId('guest-notice')).toBeVisible(REPLICATED);
	await shoot(bob, 'student-programme');

	// --- The fork alarm -------------------------------------------------------
	// The one picture that cannot be staged: two counters that cannot see each
	// other redeem the same class, and the contradiction turns up on the student's
	// card. Produced exactly as e2e/m4-tickets.spec.js produces it.
	await connectViaPaste(alice, carol);
	await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

	const carolDid = await carol.evaluate(() => window.__yoga.identity());
	await alice.getByTestId('nav-studio').click();
	await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
	const pending = alice.locator(`[data-testid="pending-device"][data-device-did="${carolDid}"]`);
	await expect(pending).toBeVisible(READY);
	await pending.getByTestId('pending-device-role').selectOption('front-desk');
	// West, not the old town: the fork picture is worth nothing if both halves of
	// the contradiction name the same counter.
	await pending.getByTestId('pending-device-location').selectOption('location:west');
	await pending.getByTestId('pending-device-register').click();
	await expect(
		alice.locator(`[data-testid="device-item"][data-device-did="${carolDid}"]`)
	).toBeVisible();

	await connectViaPaste(carol, bob);
	await carol.getByTestId('nav-checkin').click();
	await carol.getByTestId('checkin-student').selectOption(bobDid);
	await carol.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
	await expect(carol.getByTestId('ticket-balance')).toHaveText('9', REPLICATED);

	await carol.getByTestId('nav-connect').click();
	await carol.getByTestId('hang-up').click();
	await expect(carol.getByTestId('hang-up')).toHaveCount(0);

	await carol.getByTestId('nav-checkin').click();
	await carol.getByTestId('checkin-student').selectOption(bobDid);
	await carol.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
	await carol.getByTestId('checkin-redeem').first().click();
	await expect(carol.getByTestId('checkin-done')).toBeVisible();

	await alice.getByTestId('nav-checkin').click();
	await alice.getByTestId('checkin-student').selectOption(bobDid);
	await alice.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
	await expect(alice.getByTestId('checkin-redeem').first()).toBeEnabled(REPLICATED);
	await alice.getByTestId('checkin-redeem').first().click();
	await expect(alice.getByTestId('checkin-done')).toBeVisible();

	await connectViaPaste(carol, bob);
	await bob.getByTestId('nav-tickets').click();
	await expect(bob.getByTestId('fork-alarm')).toBeVisible(REPLICATED);
	await shoot(bob, 'fork-alarm');
});
