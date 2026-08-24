// T5.3 — the cash report, and the shortfall it has to own up to.
//
// Two counters out of touch will sometimes sell the same class twice. This is the
// screen where that stops being invisible: the balance is allowed to go negative,
// and the negative number is priced in euros so somebody can ask for it.
//
// The overdraft here is produced, not asserted into being: a one-class pass, two
// counters that cannot see each other, one check-in each.

import {
	connectViaPaste,
	expect,
	onboard,
	openCourseForm,
	openPackageForm,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('reconciliation', () => {
	test('the cash report groups takings by location and device', async ({ alice, bob }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		const aliceDid = await alice.evaluate(() => window.__yoga.identity());

		await alice.getByTestId('nav-report').click();
		await expect(alice.getByTestId('report-empty')).toBeVisible();

		await sellPass(alice, bobDid, 'package:zehner');

		await alice.getByTestId('nav-report').click();
		// One row, not two: with a single location the till names it, so the sale and
		// the check-in land in the same place rather than splitting the owner's
		// takings across a blank row and a named one.
		const row = alice.locator(
			`[data-testid="cash-row"][data-device-did="${aliceDid}"][data-location-id="location:altstadt"]`
		);
		await expect(row).toBeVisible(REPLICATED);
		await expect(row.getByTestId('cash-sales')).toHaveText('1');
		await expect(row.getByTestId('cash-eur')).toHaveText('120.00');
		await expect(alice.getByTestId('cash-total')).toHaveText('120.00');

		// A check-in is counted where it happened, and does not change the takings.
		await alice.getByTestId('nav-checkin').click();
		await alice.getByTestId('checkin-student').selectOption(bobDid);
		await alice.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
		await expect(alice.getByTestId('checkin-redeem').first()).toBeEnabled(REPLICATED);
		await alice.getByTestId('checkin-redeem').first().click();
		await expect(alice.getByTestId('checkin-done')).toBeVisible();

		await alice.getByTestId('nav-report').click();
		await expect(row.getByTestId('cash-redemptions')).toHaveText('1', REPLICATED);
		await expect(alice.getByTestId('cash-total')).toHaveText('120.00');

		// Nothing is owed: one class bought, one attended.
		await expect(alice.getByTestId('overdraft-list')).toHaveCount(0);
	});

	test('a class attended twice shows as a fork, and never as free credit', async ({
		alice,
		carol,
		bob
	}) => {
		test.setTimeout(900_000);

		await setUpStudio(alice);
		await addLocation(alice, 'west', 'Studio West');

		// A single-class pass, so one check-in too many is enough to go negative.
		await alice.getByTestId('nav-program').click();
		await openPackageForm(alice);
		await alice.getByTestId('package-id').fill('einzel');
		await alice.getByTestId('package-name-de').fill('Einzelstunde');
		await alice.getByTestId('package-name-en').fill('Single class');
		await alice.getByTestId('package-kind').selectOption('ten');
		await alice.getByTestId('package-price').fill('18');
		await alice.getByTestId('package-units').fill('1');
		await alice.getByTestId('package-validity-days').fill('30');
		await alice.getByTestId('package-add').click();
		await expect(alice.locator('[data-package-id="package:einzel"]')).toBeVisible();

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		const carolDid = await carol.evaluate(() => window.__yoga.identity());
		await approveDevice(alice, carolDid, 'location:west');

		await connectViaPaste(alice, bob);
		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid, 'package:einzel');

		await connectViaPaste(carol, bob);
		await carol.getByTestId('nav-checkin').click();
		await carol.getByTestId('checkin-student').selectOption(bobDid);
		await carol.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
		await expect(carol.getByTestId('ticket-balance')).toHaveText('1', REPLICATED);

		// Carol goes on her own. From here neither counter can see the other, which is
		// the ordinary state of a studio with two locations and no server.
		await carol.getByTestId('nav-connect').click();
		await carol.getByTestId('hang-up').click();
		await expect(carol.getByTestId('hang-up')).toHaveCount(0);

		// Carol acts first, and that order is not cosmetic. She is cut off, so nothing
		// can reach her; Bob has nothing from her yet, so nothing can reach Alice
		// either. Both counters therefore write position 1 from the same view, every
		// time. With Alice going first the hang-up races her check-in — under load
		// Carol can still receive it, take position 2 and produce a perfectly legal
		// chain, which is a test that fails for being right.
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

		// Bob collects Carol's half — she wrote it while cut off from everyone, so it
		// sits on her counter until he turns up — and carries it back to Alice.
		// Nothing else reconciles the two: that is the design, not a shortcut.
		await connectViaPaste(carol, bob);
		await connectViaPaste(alice, bob);

		// Both counters wrote chain position 1, so this is a fork, and a fork costs
		// exactly one unit: zero left, never minus one.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('fork-alarm')).toBeVisible(REPLICATED);
		await expect(bob.getByTestId('ticket-balance')).toHaveText('0');

		// So the report shows no recharge, and that is the correct answer rather than a
		// missing feature. A negative balance cannot be produced from these screens:
		// the check-in refuses when nothing is left, and two counters racing for the
		// same position collide into one unit instead of two. `findOverdrafts` exists
		// for ledgers that were not written by these screens — an import, or a client
		// that skipped the pre-flight — which is the case docs/LIMITS.md §1.1 says can
		// only be detected, never prevented. Its arithmetic is proven in
		// src/lib/db/reconcile.spec.ts, where such a ledger can simply be handed in.
		await alice.getByTestId('nav-report').click();
		await expect(alice.getByTestId('cash-report')).toBeVisible(REPLICATED);
		await expect(
			alice.locator(`[data-testid="overdraft"][data-student-did="${bobDid}"]`)
		).toHaveCount(0);

		// What it does show is two *disputed* check-ins, one per counter. Neither is
		// accepted — the reducer refuses both sides of a contradiction — but two
		// classes were taught, and a report saying "0 check-ins" would be true and
		// useless. That column exists because this test asked.
		// Polled, not read once. `evaluateAll` with a plain `expect` does not retry, so
		// it reads whatever is on screen the instant it runs — which here is a report
		// rendered before Carol's half of the fork finished replicating. A count that
		// does not wait is a coin toss dressed as an assertion.
		const sum = (/** @type {string} */ testid) =>
			alice
				.locator(`[data-testid="${testid}"]`)
				.evaluateAll((nodes) => nodes.reduce((total, node) => total + Number(node.textContent), 0));

		await expect.poll(() => sum('cash-disputed'), { timeout: 90_000 }).toBe(2);
		await expect.poll(() => sum('cash-redemptions'), { timeout: 90_000 }).toBe(0);
	});
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} studentDid
 * @param {string} packageId
 */
async function sellPass(page, studentDid, packageId) {
	await page.getByTestId('nav-till').click();
	await expect(page.getByTestId('till-student')).toBeVisible(REPLICATED);
	await page.getByTestId('till-student').selectOption(studentDid);
	await page.getByTestId('till-package').selectOption(packageId);
	await page.getByTestId('till-sell').click();
	await expect(page.getByTestId('till-sold')).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {string} name
 */
async function addLocation(page, id, name) {
	await page.getByTestId('nav-studio').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);
	await page.getByTestId('location-id').fill(id);
	await page.getByTestId('location-name-de').fill(name);
	await page.getByTestId('location-name-en').fill(name);
	await page.getByTestId('location-add').click();
	await expect(page.locator(`[data-location-id="location:${id}"]`)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} did
 * @param {string} locationId
 */
async function approveDevice(page, did, locationId) {
	await page.getByTestId('nav-studio').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);

	const pending = page.locator(`[data-testid="pending-device"][data-device-did="${did}"]`);
	await expect(pending).toBeVisible(READY);
	await pending.getByTestId('pending-device-role').selectOption('front-desk');
	await pending.getByTestId('pending-device-location').selectOption(locationId);
	await pending.getByTestId('pending-device-register').click();

	await expect(page.locator(`[data-testid="device-item"][data-device-did="${did}"]`)).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function setUpStudio(page) {
	await page.goto('/studio/?ice=host');
	await onboard(page, 'alice');

	await page.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await page.getByTestId('studio-save').click();

	await page.getByTestId('location-id').fill('altstadt');
	await page.getByTestId('location-name-de').fill('Studio Altstadt');
	await page.getByTestId('location-name-en').fill('Old Town Studio');
	await page.getByTestId('location-add').click();
	await expect(page.locator('[data-location-id="location:altstadt"]')).toBeVisible();

	await page.getByTestId('nav-program').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);

	await openPackageForm(page);

	await page.getByTestId('package-id').fill('zehner');
	await page.getByTestId('package-name-de').fill('10er-Karte');
	await page.getByTestId('package-name-en').fill('10-class pass');
	await page.getByTestId('package-kind').selectOption('ten');
	await page.getByTestId('package-units').fill('10');
	await page.getByTestId('package-validity-days').fill('30');
	await page.getByTestId('package-add').click();
	await expect(page.locator('[data-package-id="package:zehner"]')).toBeVisible();

	await openCourseForm(page);

	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill('vinyasa-mi-18');
	await page.getByTestId('course-location').selectOption('location:altstadt');
	await page.getByTestId('course-title-de').fill('Vinyasa Flow');
	await page.getByTestId('course-title-en').fill('Vinyasa Flow');
	await page.getByTestId('course-add').click();
	await expect(
		page.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
	).toBeVisible();
}
