// T5.1 — what a device knows, and what it cannot know.
//
// Two things are checked here, and they are the same thing seen from two sides:
// the status strip must distinguish "nobody booked that class" from "nobody told
// me about it", and a contradiction between two good-faith decisions must be
// stated rather than quietly resolved.

import {
	connectViaPaste,
	expect,
	onboard,
	openConnect,
	openCourseForm,
	openPackageForm,
	openProgramme,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('sync status', () => {
	test('says plainly when this device is alone, and what it last saw', async ({ alice }) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);

		// Alone is the state that changes what a person should conclude from every
		// screen behind this strip, so it is stated rather than left blank.
		await expect(alice.getByTestId('sync-status')).toHaveAttribute('data-peers', '0');
		await expect(alice.getByTestId('sync-alone')).toBeVisible();
		await expect(alice.getByTestId('sync-peers')).toHaveCount(0);

		// "Last change here", never "your data is current": a disconnected device
		// cannot know the second one. It must name a real time all the same, because
		// it has certainly seen its own writes.
		await expect(alice.getByTestId('sync-oldest')).not.toContainText('—');

		// And the databases are listed individually, which is what makes the summary
		// checkable rather than decorative.
		await alice.getByTestId('sync-details-toggle').click();
		await expect(alice.locator('[data-testid="sync-database"][data-key="registry"]')).toBeVisible();
		await expect(alice.locator('[data-testid="sync-database"][data-key="program"]')).toBeVisible();
	});

	test('counts the peer once a device is paired', async ({ alice, bob }) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		await expect(alice.getByTestId('sync-peers')).toBeVisible(REPLICATED);
		await expect(alice.getByTestId('sync-alone')).toHaveCount(0);
		await expect(bob.getByTestId('sync-peers')).toBeVisible();
	});
});

test.describe('who sees which screens', () => {
	test('a student is not offered the counter, and is told so if they go there', async ({
		alice,
		bob
	}) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// What a student can actually use. The till, check-in, the registry and the
		// cash report all render nothing without a studio role, so offering them was
		// four dead ends out of eight entries.
		await expect(bob.getByTestId('nav-program')).toBeVisible();
		await expect(bob.getByTestId('nav-bookings')).toBeVisible();
		await expect(bob.getByTestId('nav-tickets')).toBeVisible();
		await expect(bob.getByTestId('nav-connect')).toBeVisible();

		await expect(bob.getByTestId('nav-till')).toHaveCount(0);
		await expect(bob.getByTestId('nav-checkin')).toHaveCount(0);
		await expect(bob.getByTestId('nav-studio')).toHaveCount(0);
		await expect(bob.getByTestId('nav-report')).toHaveCount(0);

		// The owner keeps everything: a studio device is also somebody's device, and
		// she books classes herself.
		await expect(alice.getByTestId('nav-till')).toBeVisible();
		await expect(alice.getByTestId('nav-tickets')).toBeVisible();

		// A URL is still a URL — a bookmark or a shared link lands here — so the
		// screen says which case it is rather than showing a bare heading.
		await bob.goto('/till/?ice=host');
		const notice = bob.getByTestId('counter-only');
		await expect(notice).toBeVisible(READY);
		await expect(notice).toHaveAttribute('data-joined', 'true');
		await expect(bob.getByTestId('till-student')).toHaveCount(0);
	});
});

test.describe('conflicts', () => {
	test('a cancellation after check-in is stated, not resolved', async ({ alice, bob }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());

		// Bob books the class and buys a pass for it.
		await openProgramme(bob);
		await expect(bob.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible(REPLICATED);
		await bob.locator('[data-course-id="course:vinyasa-mi-18"]').getByTestId('course-book').click();

		await bob.getByTestId('nav-bookings').click();
		const booking = bob.getByTestId('my-booking').first();
		await expect(booking).toHaveAttribute('data-status', 'requested');
		const date = await booking.getAttribute('data-date');

		await alice.getByTestId('nav-till').click();
		await expect(alice.getByTestId('till-student')).toBeVisible(REPLICATED);
		await alice.getByTestId('till-student').selectOption(bobDid);
		await alice.getByTestId('till-package').selectOption('package:zehner');
		await alice.getByTestId('till-sell').click();
		await expect(alice.getByTestId('till-sold')).toBeVisible();

		// The counter checks him in for that class, on that day.
		await alice.getByTestId('nav-checkin').click();
		await alice.getByTestId('checkin-student').selectOption(bobDid);
		await alice.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
		if (date) await alice.getByTestId('checkin-date').fill(date);
		await expect(alice.getByTestId('checkin-redeem').first()).toBeEnabled(REPLICATED);
		await alice.getByTestId('checkin-redeem').first().click();
		await expect(alice.getByTestId('checkin-done')).toBeVisible();

		// And Bob cancels — from the tram, having forgotten he already went in. Both
		// actions were reasonable when they were taken; neither is a mistake to be
		// corrected by a machine.
		await bob.getByTestId('nav-bookings').click();
		await expect(bob.getByTestId('my-booking').first()).toBeVisible();
		await bob.getByTestId('booking-cancel').first().click();
		await expect(bob.getByTestId('my-booking').first()).toHaveAttribute('data-status', 'cancelled');

		// The contradiction is named, and the booking stays cancelled: the app does
		// not un-cancel it, and does not un-redeem the class either.
		const conflict = bob.locator('[data-testid="conflict"][data-kind="cancelled-after-redeem"]');
		await expect(conflict).toBeVisible(REPLICATED);
		await expect(bob.getByTestId('my-booking').first()).toHaveAttribute('data-status', 'cancelled');

		// The class stays used, too: nine of ten. Resolving the contradiction by
		// refunding the unit would be the app deciding something only a person can.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('9', REPLICATED);
	});

	test('says when something last came in, not only that a peer is there', async ({
		alice,
		bob
	}) => {
		// "2 devices connected" says they found each other. It does not say
		// anything crossed — and that was the whole complaint: the bar looked the
		// same whether replication worked or silently did not.
		test.setTimeout(420_000);

		await setUpStudio(alice);

		// Onboarded but not yet paired: nothing has arrived, and the bar says so
		// rather than leaving the field blank, which reads as "unknown". The bar
		// does not exist before onboarding, so this cannot be asserted earlier.
		await openConnect(bob, 'bob');
		await expect(bob.getByTestId('sync-received')).toHaveAttribute('data-received', '');

		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// Now something has: the studio's programme reached Bob, and the bar can
		// name when. Asserted through the attribute rather than the text, so the
		// test does not depend on how a time is formatted.
		await expect(bob.getByTestId('sync-received')).not.toHaveAttribute('data-received', '', READY);

		// And it stays after hanging up: what arrived is still what arrived. A bar
		// that forgot on disconnect would be reporting the connection twice.
		await bob.getByTestId('nav-connect').click();
		await bob.getByTestId('hang-up').click();
		await expect(bob.getByTestId('sync-status')).toHaveAttribute('data-peers', '0', READY);
		await expect(bob.getByTestId('sync-received')).not.toHaveAttribute('data-received', '');
	});
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

	await openProgramme(page);
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
