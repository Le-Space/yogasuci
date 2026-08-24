// M3 — booking, from both sides, and the privacy boundary that justifies the
// per-student cut (docs/PLAN.md §3.3).
//
// The last scenario is the important one. It is the reason the design changed,
// and it is worth more than the happy path: if it ever goes green by accident
// — because someone reintroduced a shared database, say — the app is handing
// classmates each other's attendance records again.

import {
	connectViaPaste,
	expect,
	onboard,
	openCourseForm,
	openProgramme,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('bookings', () => {
	test('Bob books, Alice confirms, Bob cancels', async ({ alice, bob }) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// --- Bob books a class ------------------------------------------------
		await openProgramme(bob);
		await expect(
			bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		).toBeVisible(REPLICATED);
		const card = bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]');
		await card.getByTestId('course-book').click();

		// The screen you are standing on has to answer, or nothing appears to have
		// happened and the obvious response is to press again. The state replaces
		// the button rather than sitting beside it, so a second request is not
		// offered in the first place.
		await expect(card.getByTestId('course-booking-state')).toHaveAttribute(
			'data-status',
			'requested'
		);
		await expect(card.getByTestId('course-book')).toHaveCount(0);

		// Written here is not arrived there, and the line says which one this is.
		// Bob is connected to Alice at this point, so it claims delivery — the
		// disconnected wording is asserted in its own test below.
		await expect(card.getByTestId('course-booking-delivery')).toBeVisible();

		await bob.getByTestId('nav-bookings').click();
		const booking = bob.locator('[data-testid="my-booking"]').first();
		await expect(booking).toHaveAttribute('data-status', 'requested');

		// Until the studio has seen it, "requested" is a local fact and the UI
		// says so — the difference from a server-backed app, where a request
		// either arrived or visibly failed.
		await expect(booking.getByTestId('my-booking-pending')).toBeVisible();

		// --- Alice sees the request and confirms -------------------------------
		await alice.getByTestId('nav-bookings').click();
		const incoming = alice.getByTestId('incoming-booking').first();
		await expect(incoming).toBeVisible(REPLICATED);

		await incoming.getByTestId('booking-confirm').click();

		// The decision travels back into Bob's own database.
		await expect(booking).toHaveAttribute('data-status', 'confirmed', REPLICATED);
		await expect(booking.getByTestId('my-booking-pending')).toHaveCount(0);

		// --- Bob gives the place back -------------------------------------------
		await booking.getByTestId('booking-cancel').click();
		await expect(booking).toHaveAttribute('data-status', 'cancelled');

		// The request disappears from the studio's queue, rather than lingering
		// as something already dealt with.
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(0, REPLICATED);
	});

	test('the occupancy counter moves without exposing anyone', async ({ alice, bob }) => {
		test.setTimeout(420_000);

		// Capacity 1, so the counter reaching its limit is unambiguous.
		await setUpStudio(alice, { capacity: '1' });
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const course = bob.locator(
			'[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]'
		);

		// Nobody has published a count yet, and the app says so rather than
		// guessing zero.
		await openProgramme(bob);
		await expect(course).toBeVisible(REPLICATED);
		await expect(course.getByTestId('course-occupancy')).toContainText(
			/unbekannt|unknown/,
			REPLICATED
		);

		await course.getByTestId('course-book').click();

		await alice.getByTestId('nav-bookings').click();
		await alice.getByTestId('incoming-booking').first().getByTestId('booking-confirm').click();

		// The count reaches Bob through the programme database — the one everyone
		// replicates — carrying a number and nothing else.
		await openProgramme(bob);
		await expect(course).toHaveAttribute('data-free', '0', REPLICATED);
		await expect(course.getByTestId('course-occupancy')).toContainText(/Ausgebucht|Fully booked/);

		// What Bob received is a number. It says nothing about who holds the place
		// — even though in this scenario he does.
		const published = await bob.evaluate(() =>
			[...document.querySelectorAll('[data-testid="course-occupancy"]')].map((n) => n.textContent)
		);
		expect(published.join(' ')).not.toContain('did:');
	});

	test('a full class cannot be confirmed twice', async ({ alice, bob, carol }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice, { capacity: '1' });

		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await bookFirstCourse(bob);

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await bookFirstCourse(carol);

		// Both asked — neither was refused at request time, because a requesting
		// device cannot see the whole picture (docs/PLAN.md §3.3.1).
		await alice.getByTestId('nav-bookings').click();
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(2, REPLICATED);

		await alice.getByTestId('incoming-booking').first().getByTestId('booking-confirm').click();
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(1, REPLICATED);

		// The second confirmation is refused here, where the count is known.
		await alice.getByTestId('incoming-booking').first().getByTestId('booking-confirm').click();
		await expect(alice.getByTestId('bookings-error')).toBeVisible();
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(1);
	});

	test('a booking made offline is marked as not yet arrived', async ({ alice, bob }) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// Visit both screens first. The programme has to be on Bob's device or
		// this would test replication rather than the offline state — and the
		// bookings route's JavaScript has to be loaded too, because a code-split
		// chunk cannot be fetched once the network is gone. A real student's
		// device would have it from the service worker; the preview server this
		// test runs against is closer to a cold install.
		await bob.getByTestId('nav-bookings').click();
		await expect(bob.getByTestId('my-bookings')).toBeVisible();
		await openProgramme(bob);
		await expect(
			bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		).toBeVisible(REPLICATED);

		// Walking out of the studio, modelled by ending the connection rather than by
		// `setOffline`. That was what this test used, and it does not do what it looks
		// like it does: an established WebRTC data channel over loopback survives the
		// browser's network emulation, so the booking still reached Alice and this
		// assertion passed on timing alone. Measured while chasing an unrelated fork
		// test; the same mistake is called out in e2e/m5-report.spec.js.
		await bob.getByTestId('nav-connect').click();
		await bob.getByTestId('hang-up').click();
		await expect(bob.getByTestId('hang-up')).toHaveCount(0);

		await openProgramme(bob);
		await bob
			.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
			.getByTestId('course-book')
			.click();
		await bob.getByTestId('nav-bookings').click();

		const booking = bob.getByTestId('my-booking').first();
		await expect(booking).toHaveAttribute('data-status', 'requested');

		// The distinction the whole app rests on: the booking exists here, and the
		// UI says plainly that nobody else knows about it yet. A server-backed app
		// would have failed the request outright.
		await expect(booking.getByTestId('my-booking-pending')).toBeVisible();

		// And it is genuinely local — the studio has not seen it.
		await alice.getByTestId('nav-bookings').click();
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(0);
	});

	test('Bob never sees Carol’s booking', async ({ alice, bob, carol }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);

		// Both students pair with the studio and book the same class.
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await bookFirstCourse(bob);

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await bookFirstCourse(carol);

		// Alice, holding both databases, sees both requests.
		await alice.getByTestId('nav-bookings').click();
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(2, REPLICATED);

		// Bob sees exactly one booking — his own. This is the property the
		// per-student cut exists for: there is no database Bob replicates that
		// contains Carol's attendance, and he was never told an address for one.
		await bob.getByTestId('nav-bookings').click();
		await expect(bob.getByTestId('my-booking')).toHaveCount(1);

		const carolDid = await carol.evaluate(() => window.__yoga.identity());
		const bobSeesCarol = await bob.evaluate(
			async (did) =>
				(await window.__yoga.databases()).some((database) => database.address.includes(did)),
			carolDid
		);
		expect(bobSeesCarol, 'Bob must not hold any database belonging to Carol').toBe(false);

		// And no incoming queue at all: he is not a studio device.
		await expect(bob.getByTestId('incoming-list')).toHaveCount(0);
	});

	test('a request made with nobody connected says it has not left the device', async ({
		alice,
		bob
	}) => {
		// The honest half of the feedback. Without a server nothing can confirm
		// delivery, so the only truthful signal is whether anybody was there to
		// carry it — and a student who books at home, before ever pairing, must
		// not be told the studio has their request.
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// Bob keeps the programme he replicated and loses the peer that brought it.
		await bob.getByTestId('nav-connect').click();
		await bob.getByTestId('hang-up').click();
		await expect(bob.getByTestId('sync-status')).toHaveAttribute('data-peers', '0', READY);

		await openProgramme(bob);
		const card = bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]');
		await expect(card).toBeVisible(READY);
		await card.getByTestId('course-book').click();

		await expect(card.getByTestId('course-booking-state')).toHaveAttribute(
			'data-status',
			'requested'
		);
		await expect(card.getByTestId('course-booking-delivery')).toContainText(/Gerät|device/);
	});

	test('a request can be withdrawn, and the course becomes bookable again', async ({
		alice,
		bob
	}) => {
		// A mis-tap must be undoable. Without this the state that replaces the
		// button is a trap: it stops the second request and offers no way back.
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		await openProgramme(bob);
		const card = bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]');
		await expect(card).toBeVisible(REPLICATED);

		await card.getByTestId('course-book').click();
		await expect(card.getByTestId('course-booking-state')).toBeVisible();

		await card.getByTestId('course-booking-withdraw').click();

		await expect(card.getByTestId('course-book')).toBeVisible();
		await expect(card.getByTestId('course-booking-state')).toHaveCount(0);
	});
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ capacity?: string }} [options]
 */
async function setUpStudio(page, { capacity } = {}) {
	await page.goto('/studio/?ice=host');
	await onboard(page, 'alice');

	await page.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await page.getByTestId('studio-save').click();

	await page.getByTestId('location-id').fill('altstadt');
	await page.getByTestId('location-name-de').fill('Studio Altstadt');
	await page.getByTestId('location-name-en').fill('Old Town Studio');
	await page.getByTestId('location-add').click();
	await expect(page.locator('[data-location-id="location:altstadt"]')).toBeVisible();

	await openProgramme(page);
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);
	await openCourseForm(page);
	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill('vinyasa-mi-18');
	await page.getByTestId('course-location').selectOption('location:altstadt');
	await page.getByTestId('course-title-de').fill('Vinyasa Flow');
	await page.getByTestId('course-title-en').fill('Vinyasa Flow');
	if (capacity) await page.getByTestId('course-capacity').fill(capacity);
	await page.getByTestId('course-add').click();
	await expect(
		page.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
	).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function bookFirstCourse(page) {
	await openProgramme(page);
	await expect(
		page.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
	).toBeVisible(REPLICATED);
	await page
		.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		.getByTestId('course-book')
		.click();

	await page.getByTestId('nav-bookings').click();
	await expect(page.getByTestId('my-booking')).toHaveCount(1);
}
