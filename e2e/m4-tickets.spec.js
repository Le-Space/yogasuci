// T4.2 — selling a pass for cash, and the balance that follows from it.
//
// The ledger itself is proven by unit tests; what this checks is the wiring:
// that an `issue` event written at the counter reaches the student, that its
// signature verifies against the registry, and that both devices fold the same
// log into the same number.

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

test.describe('cash purchase', () => {
	test('a pass sold at the counter shows the right balance on both devices', async ({
		alice,
		bob
	}) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// Bob has bought nothing, and the screen says so rather than showing a
		// zero that could be mistaken for an empty pass.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('tickets-empty')).toBeVisible();

		// --- Alice sells a ten-class pass ------------------------------------
		await alice.getByTestId('nav-till').click();
		await expect(alice.getByTestId('till-student')).toBeVisible(REPLICATED);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await alice.getByTestId('till-student').selectOption(bobDid);
		await alice.getByTestId('till-package').selectOption('package:zehner');
		await alice.getByTestId('till-sell').click();

		await expect(alice.getByTestId('till-sold')).toBeVisible();
		await expect(alice.getByTestId('till-error')).toHaveCount(0);

		// --- The balance appears on Bob's device -------------------------------
		// Not because anything told it to: the issue event replicated, its
		// signature verified against the registry, and the fold produced ten.
		const card = bob.getByTestId('ticket-card').first();
		await expect(card).toBeVisible(REPLICATED);
		await expect(card.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);
		await expect(card).toHaveAttribute('data-status', 'active');

		// "Stand vom …" is part of the balance, not decoration: without a server
		// there is no other honest way to say how current a number is.
		await expect(card.getByTestId('ticket-as-of')).not.toHaveText('—');

		// --- Retiring the pass stops the counter offering it -------------------
		// Asserted here rather than in m1 because the till only renders its form
		// once there is a student to sell to, and this test already has one.
		//
		// The sale above is untouched by it: a ticket carries the price and the
		// name it was sold under, so retiring the pass cannot rewrite what Bob
		// already paid.
		await alice.getByTestId('nav-program').click();
		await alice
			.locator('[data-package-id="package:zehner"]')
			.getByTestId('package-deactivate')
			.click();

		await alice.getByTestId('nav-till').click();
		await expect(alice.getByTestId('till-student')).toBeVisible(REPLICATED);
		await expect(alice.getByTestId('till-package').locator('option')).toHaveCount(1);

		await expect(card.getByTestId('ticket-balance')).toHaveText('10');
	});

	// Not tested here on purpose: "an event from an unregistered device is
	// refused" is a property of the fold, and the unit suite proves it
	// deterministically — `refuses an event from a device that was never
	// registered` in src/lib/ledger/reduce.spec.ts, alongside revoked devices
	// and bad signatures. Staging the same thing through two browsers would
	// test the same line of code with far more ways to be flaky.
});

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
	await expect(page.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible();
}

test.describe('check-in and the courier roundtrip', () => {
	// The scenario the whole design exists for: two locations that never speak to
	// each other, kept consistent by the student walking between them.
	//
	// Slow on purpose, and worth the minutes — it is the only test that holds
	// three devices at once, which is what surfaced the single-offer-slot defect
	// and the grant-in-flight race that the two-device tests cannot reach.
	test('a redemption at one location is visible at the other', async ({ alice, carol, bob }) => {
		test.setTimeout(900_000);

		// --- Alice's studio, with Carol's device approved for location West ----
		await setUpStudio(alice);
		await addLocation(alice, 'west', 'Studio West');

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const carolDid = await carol.evaluate(() => window.__yoga.identity());
		await approveDevice(alice, carolDid, 'location:west');

		// --- Bob buys a ten-class pass at Alice's counter ----------------------
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid);

		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);

		// --- Redeemed once at Alice's location --------------------------------
		await redeemAt(alice, bobDid);
		await expect(bob.getByTestId('ticket-balance')).toHaveText('9', REPLICATED);

		// --- Bob walks to the other location ----------------------------------
		// He is the courier: the redemption above lives in his ledger, and he
		// carries it to Carol simply by turning up (docs/PLAN.md §5, layer 1).
		await connectViaPaste(carol, bob);

		// Carol's counter sees nine, not ten — she never spoke to Alice.
		await carol.getByTestId('nav-checkin').click();
		await carol.getByTestId('checkin-student').selectOption(bobDid);
		await carol.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
		await expect(carol.getByTestId('ticket-balance')).toHaveText('9', REPLICATED);

		// --- Redeemed again, at the second location ---------------------------
		await carol.getByTestId('checkin-redeem').first().click();
		await expect(carol.getByTestId('checkin-done')).toBeVisible();

		// Back to his own passes: pairing left him on the connect screen, which has
		// no ticket card on it at all — and a missing element is not a balance of
		// eight, so asserting from there would prove nothing either way.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('8', REPLICATED);

		// --- Back to Alice ------------------------------------------------------
		await connectViaPaste(alice, bob);

		// Both redemptions are on Alice's device now, one of which she never saw
		// written. No relay carried it — Bob did.
		await alice.getByTestId('nav-checkin').click();
		await alice.getByTestId('checkin-student').selectOption(bobDid);
		await expect(alice.getByTestId('ticket-balance')).toHaveText('8', REPLICATED);

		// And the chain is intact: two accepted redemptions, no fork anywhere.
		await expect(alice.getByTestId('fork-alarm')).toHaveCount(0);

		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-card').first()).toHaveAttribute('data-status', 'active');
		await expect(bob.getByTestId('fork-alarm')).toHaveCount(0);
	});

	test('the studio owns the ledger and the student cannot write to it', async ({ alice, bob }) => {
		test.setTimeout(600_000);

		// The books belong to whoever took the money (docs/PLAN.md §3.4). Two
		// properties carry that, and both are checked here rather than described:
		// the address is derived on both sides instead of exchanged, and the studio
		// owner — not the student — is admin of the student's own ledger.
		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		const aliceDid = await alice.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid);

		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);

		const own = await bob.evaluate(
			async () => (await window.__yoga.databases()).find((row) => row.key === 'tickets'),
			null
		);
		const asStudio = await alice.evaluate(
			async (key) => (await window.__yoga.databases()).find((row) => row.key === key),
			`tickets:${bobDid}`
		);

		// Nobody sent this address. Both sides derived it from Bob's DID and the
		// owner's, which is what let the introduction protocol stop carrying it —
		// and what stops two counters that have never met creating two ledgers for
		// the same person.
		expect(asStudio?.address).toBe(own?.address);

		// Bob replicates his own passes and can read them, and is in neither the
		// write nor the admin set of the log they live in. Before this change he was
		// its admin, which put the power to lock the studio out of writing further
		// redemptions in the hands of the one person who benefits from that.
		expect(own?.writers?.admin).toContain(aliceDid);
		expect(own?.writers?.write ?? []).not.toContain(bobDid);
		expect(own?.writers?.admin ?? []).not.toContain(bobDid);
	});

	test('two counters redeeming the same position raise a fork alarm', async ({
		alice,
		carol,
		bob
	}) => {
		test.setTimeout(900_000);

		// T4.4, and the case the whole ledger design is shaped around: detection
		// rather than prevention (docs/LIMITS.md §1.1). Nothing is simulated here —
		// two real counters that cannot see each other each write chain position 1,
		// which is exactly what a reset ledger produces, and the contradiction only
		// becomes visible when the student carries both halves into one place.
		await setUpStudio(alice);
		await addLocation(alice, 'west', 'Studio West');

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		const carolDid = await carol.evaluate(() => window.__yoga.identity());
		await approveDevice(alice, carolDid, 'location:west');

		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid);

		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);

		// Carol's counter takes a copy while she can still reach anyone.
		await connectViaPaste(carol, bob);
		await carol.getByTestId('nav-checkin').click();
		await carol.getByTestId('checkin-student').selectOption(bobDid);
		await carol.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
		await expect(carol.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);

		// From here she is on her own — a second location with no line to the first,
		// which is the normal state of this app rather than a failure of it.
		//
		// Ending the connection, not `setOffline`: that was the first attempt and it
		// quietly did nothing, because an established WebRTC data channel over
		// loopback survives the browser's network emulation. Carol went on receiving
		// Alice's redemption and dutifully took position 2, producing a perfectly
		// legal chain and no alarm — a test that proved the opposite of what it
		// claimed. Hanging up closes the connection for real.
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

		await redeemAt(alice, bobDid);

		// Read from Bob's own passes, not from the connect screen he was left on —
		// a missing element there would pass for any balance at all.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('9', REPLICATED);

		// The student walks back, and carries the contradiction with him.
		await connectViaPaste(carol, bob);

		await bob.getByTestId('nav-tickets').click();
		const alarm = bob.getByTestId('fork-alarm');
		await expect(alarm).toBeVisible(REPLICATED);

		// Both signed events, as evidence rather than an accusation: same position,
		// two locations, two devices, two signatures. That is what a person can act
		// on — and it is what the first run of this test exposed as missing, because
		// the owner's device carries no location of its own and the line read "at two
		// blanks".
		const proofs = alarm.getByTestId('fork-proof');
		await expect(proofs).toHaveCount(2);

		// Both locations, without pinning which comes first: the reducer orders a
		// fork's events by a stable comparison of its own, and a test that fixed that
		// order would be asserting an implementation detail rather than the evidence.
		// Named places, not keys: the evidence line is what somebody at a counter acts
		// on. Asserted without naming either one, because the studio has a German and
		// an English name for the same location and this suite must not assume a
		// language (docs/TESTING.md). What has to hold is that no raw id leaks through
		// and that the two halves name *different* counters — which is the whole point
		// of the evidence.
		const lines = await proofs.allTextContents();
		expect(lines.join(' ')).not.toContain('location:');
		expect(lines[0]).not.toBe(lines[1]);

		// Nine, not eight: a fork costs exactly one unit. An ambiguous log must
		// never hand out credit, and must never charge twice for one contradiction
		// either (src/lib/ledger/reduce.spec.ts, "no credit from conflict").
		await expect(bob.getByTestId('ticket-balance')).toHaveText('9');

		// The alarm is a property of the log, not of Bob's screen: Alice reaches the
		// same verdict from the same events once they reach her.
		await connectViaPaste(alice, bob);
		await alice.getByTestId('nav-checkin').click();
		await alice.getByTestId('checkin-student').selectOption(bobDid);
		await expect(alice.getByTestId('fork-alarm')).toBeVisible(REPLICATED);
	});

	test('a redemption outside the ticket’s window is refused', async ({ alice, bob }) => {
		test.setTimeout(600_000);

		// Course binding (`wrong-course`) needs a series-bound ticket, which the
		// till cannot sell yet — that arrives with series tickets. This covers the
		// rule a counter actually hits daily instead, and the reducer's unit tests
		// cover every other combination deterministically.
		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid);

		await alice.getByTestId('nav-checkin').click();
		await alice.getByTestId('checkin-student').selectOption(bobDid);
		await alice.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');

		// The pass was sold today with a 30-day window; a year out is outside it.
		const farFuture = new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString().slice(0, 10);
		await alice.getByTestId('checkin-date').fill(farFuture);

		await alice.getByTestId('checkin-redeem').first().click();

		// Refused with a reason a person at a counter can act on, not a stack trace.
		await expect(alice.getByTestId('checkin-error')).toBeVisible();
		await expect(alice.getByTestId('checkin-done')).toHaveCount(0);

		// And nothing was written: the balance is untouched.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);
	});
});

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

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} studentDid
 */
async function sellPass(page, studentDid) {
	await page.getByTestId('nav-till').click();
	await expect(page.getByTestId('till-student')).toBeVisible(REPLICATED);
	await page.getByTestId('till-student').selectOption(studentDid);
	await page.getByTestId('till-package').selectOption('package:zehner');
	await page.getByTestId('till-sell').click();
	await expect(page.getByTestId('till-sold')).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} studentDid
 */
async function redeemAt(page, studentDid) {
	await page.getByTestId('nav-checkin').click();
	await page.getByTestId('checkin-student').selectOption(studentDid);
	await page.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
	await expect(page.getByTestId('checkin-redeem').first()).toBeEnabled(REPLICATED);
	await page.getByTestId('checkin-redeem').first().click();
	await expect(page.getByTestId('checkin-done')).toBeVisible();
}
