// T2.2 — a second device joins a studio and replicates it.
//
// This is the first scenario in which the app does something genuinely
// peer-to-peer: Alice's programme reaches Bob's device over the WebRTC
// connection the QR handshake built, with no relay and nothing else exchanged
// by hand.

import {
	connectViaPaste,
	expect,
	onboard as onboardVia,
	openCourseForm,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('joining a studio', () => {
	// Not green yet, and not for lack of the mechanism: the join itself works
	// and Alice's registry does reach Bob — verified through `window.__yoga`,
	// which reported her two registry entries on his device. What this scenario
	// cannot yet do is prove it end to end inside a time budget: it needs four
	// full page loads, and each one boots a fresh libp2p + Helia + OrbitDB
	// stack. Together with the identity instability in docs/LIMITS.md §2.2 that
	// makes the outcome depend on which session signed what.
	//
	// Left as an explicit gap rather than deleted or padded with a longer
	// timeout: it is the acceptance criterion for T2.2 and should be the thing
	// that turns green when the provider is fixed.
	test('Bob joins Alice’s studio and replicates her registry', async ({ alice, bob }) => {
		// Each page load boots a fresh libp2p + Helia + OrbitDB stack, and those
		// dominate the runtime — hence the generous budget and the deliberately
		// short setup.
		test.setTimeout(420_000);

		// --- Alice sets up a studio with one location ------------------------
		await onboard(alice, 'alice');

		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await addLocation(alice, 'altstadt', 'Studio Altstadt');

		// One course, so there is something on the programme carrying that location.
		await alice.getByTestId('nav-program').click();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await addCourse(alice, 'vinyasa-mi-18', 'Vinyasa Flow');

		// --- The handshake, then the join ------------------------------------
		await connectViaPaste(alice, bob);

		// Bob asked Alice which studio she belongs to and opened it. Alice, who
		// already has a studio, must not have been pulled into Bob's empty one.
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await expect(bob.getByTestId('join-status')).toContainText('Yoga Eggenfelden');
		await expect(alice.getByTestId('join-status')).toHaveCount(0);

		// --- Replication -------------------------------------------------------
		// In-app navigation, not page.goto: a full load would rebuild the libp2p
		// node and drop the connection this test is about. Clicking the nav link
		// is also what a person actually does.
		//
		// Checked on the programme rather than on /studio, and not only because the
		// registry editor is no longer in a student's navigation: the name of a
		// location lives in the registry while the course carries only its id, so a
		// course row showing "Studio Altstadt" is proof the registry arrived — on a
		// screen a student actually has.
		await bob.getByTestId('nav-program').click();
		await expect(bob.getByTestId('studio-ready')).toBeVisible(READY);

		// One row, two databases. The course comes from the programme; the words
		// "Studio Altstadt" come from the registry, because the course itself only
		// carries `location:altstadt`. So the name appearing is the registry arriving.
		const course = bob.locator('[data-course-id="course:vinyasa-mi-18"]');
		await expect(course).toBeVisible(REPLICATED);
		await expect(course).toHaveAttribute('data-location-id', 'location:altstadt');
		await expect(course).toContainText('Studio Altstadt', REPLICATED);

		// Bob is a guest: the editor is not his to use, and the app says so
		// rather than letting him write into a database the ACL would refuse.
		await expect(bob.getByTestId('guest-notice')).toBeVisible();
		await expect(bob.getByTestId('course-add')).toHaveCount(0);
	});

	// Still unproven, and for a different reason than before. The identity
	// instability that was breaking this is fixed (see stableIdentity() and
	// m2-identity.spec.js); what blocks the scenario now is its own cost —
	// every page load boots a fresh libp2p + Helia + OrbitDB stack, and three
	// of them do not fit in the budget. Raising the timeout would hide that
	// rather than fix it.
	//
	// Making these green is a test-performance problem: reuse one node across
	// navigations instead of reloading. Kept explicit because they are the
	// acceptance criteria for T2.2.
	test('Bob sees a course Alice adds while they are connected', async ({ alice, bob }) => {
		test.setTimeout(300_000);

		await onboard(alice, 'alice');
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await addLocation(alice, 'altstadt', 'Studio Altstadt');

		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		await alice.getByTestId('nav-program').click();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await addCourse(alice, 'yin-fr-19', 'Yin Yoga');

		await bob.getByTestId('nav-program').click();
		await expect(bob.locator('[data-course-id="course:yin-fr-19"]')).toBeVisible(REPLICATED);
	});

	test('a device that offers no studio is refused politely', async ({ bob, carol }) => {
		test.setTimeout(240_000);

		// Neither has named a studio, so neither has anything to hand over. The
		// connection still has to succeed — only the join reports nothing found.
		// connectViaPaste onboards both on the way, so neither needs a separate
		// visit: each extra page load boots another libp2p + Helia + OrbitDB
		// stack, and those dominate the runtime of this suite.
		await connectViaPaste(bob, carol);

		await expect(bob.getByTestId('connection-status')).toHaveAttribute('data-step', 'connected');
		await expect(carol.getByTestId('connection-status')).toHaveAttribute('data-step', 'connected');
	});

	// Reported from a phone: the bar said "connected to nobody" while the line
	// below it said, in green, that the programme was being replicated. Both were
	// reading real state — the connection had died minutes earlier, most likely
	// when the phone suspended the page — but only one of them knew.
	//
	// The membership is not the bug and must survive: belonging to a studio
	// outlives a connection the way it outlives a reload. What must not survive is
	// the claim that something is happening right now.
	//
	// Both directions, because the report came with an observation worth testing
	// rather than dismissing: that it seemed to happen when the studio held out
	// the code and the student scanned it, and not the other way round. The fix
	// reads the peer count on whichever device renders the line, so it should not
	// care — and "should not" is the reason to run it rather than to assert it.
	for (const studioOffers of [true, false]) {
		const direction = studioOffers ? 'the studio holds out the code' : 'the student holds it out';

		test(`stops claiming a live sync once the connection is gone — ${direction}`, async ({
			alice,
			bob
		}) => {
			test.setTimeout(420_000);

			await onboard(alice, 'alice');
			await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
			await alice.getByTestId('studio-save').click();

			if (studioOffers) await connectViaPaste(alice, bob);
			else await connectViaPaste(bob, alice);

			const status = bob.getByTestId('join-status');

			await expect(status).toHaveAttribute('data-state', 'joined', READY);
			await expect(status).toHaveAttribute('data-live', 'true');

			// --- the connection ends, the membership does not --------------------
			await bob.getByTestId('hang-up').click();

			await expect(status).toHaveAttribute('data-live', 'false', READY);
			await expect(status).toHaveAttribute('data-state', 'joined');
			await expect(status).toContainText('Yoga Eggenfelden');

			// Asserted on the attribute rather than the sentence: both sentences name
			// the studio, which is exactly why every existing test here stayed green
			// while the screen was contradicting itself.
		});
	}
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} who
 */
async function onboard(page, who) {
	await page.goto('/studio/?ice=host');
	await expect(page.getByTestId('onboarding')).toBeVisible(READY);
	await onboardVia(page, who);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {string} name
 */
async function addLocation(page, id, name) {
	await page.getByTestId('location-id').fill(id);
	await page.getByTestId('location-name-de').fill(name);
	await page.getByTestId('location-name-en').fill(name);
	await page.getByTestId('location-add').click();

	await expect(page.locator(`[data-location-id="location:${id}"]`)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {string} title
 */
async function addCourse(page, id, title) {
	await openCourseForm(page);
	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill(id);
	await page.getByTestId('course-location').selectOption('location:altstadt');
	await page.getByTestId('course-title-de').fill(title);
	await page.getByTestId('course-title-en').fill(title);
	await page.getByTestId('course-add').click();

	await expect(page.locator(`[data-course-id="course:${id}"]`)).toBeVisible();
}
