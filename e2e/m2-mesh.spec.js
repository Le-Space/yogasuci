// More than one device at a time, and visibly so.
//
// The connection screen could always hold several peers — libp2p keeps every
// connection it upgraded, and `connectedPeersStore` has counted all of them for
// as long as it has existed. What it could not do is *say* so: one line naming
// the first peer id, so a front desk with a teacher and two students on it
// looked exactly like a front desk with one, and there was no way to end one of
// those connections without ending all three.
//
// So these tests are about what a person at the counter can see and do, not
// about whether the transport supports a mesh. It already did.

import {
	test,
	expect,
	connectViaPaste,
	newActor,
	onboard as onboardVia,
	openConnect,
	openCourseForm
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 120_000 };

test.describe('a front desk with more than one device on it', () => {
	test('shows both, and lets one go without dropping the other', async ({ alice, bob, carol }) => {
		// Three libp2p + Helia + OrbitDB stacks and two full handshakes.
		test.setTimeout(600_000);

		await connectViaPaste(alice, bob);
		await connectViaPaste(alice, carol);

		const list = alice.getByTestId('device-list');

		// Located by full peer id rather than by the text in the row: the element
		// shortens what it shows, and matching on `abc12345…xyz789` would be a test
		// of its formatting instead of of who is connected.
		const bobId = await bob.getByTestId('own-peer-id').innerText();
		const carolId = await carol.getByTestId('own-peer-id').innerText();
		const bobRow = list.locator(`[data-peer="${bobId}"]`);
		const carolRow = list.locator(`[data-peer="${carolId}"]`);

		// Both. A count alone would pass while the screen still named only the
		// first one, which is the bug this replaces.
		await expect(bobRow).toBeVisible(READY);
		await expect(carolRow).toBeVisible(READY);
		await expect(alice.getByTestId('connection-status')).toContainText('2');

		// --- one leaves ------------------------------------------------------
		// The student walks out; the teacher's tablet stays. Before this, the only
		// control was "end connection", which took both.
		await carolRow.getByRole('button').click();

		await expect(carolRow).toHaveCount(0, READY);
		await expect(bobRow).toBeVisible();
		await expect(alice.getByTestId('connection-status')).toHaveAttribute(
			'data-step',
			'connected',
			READY
		);
	});

	test('says nothing about devices when none are connected', async ({ alice }) => {
		await openConnect(alice, 'alice');

		await expect(alice.getByTestId('devices')).toHaveCount(0);
	});

	test('carries a new course to three devices at once, and loses none of them', async ({
		alice,
		bob,
		carol,
		browser
	}) => {
		// Four libp2p + Helia + OrbitDB stacks and three full handshakes. This is
		// the most expensive test in the suite by some way, and it exists because
		// "nothing caps the number of connections" is an argument rather than a
		// measurement — and because two subscribers is exactly the count at which a
		// gossipsub mesh problem still hides.
		test.setTimeout(900_000);

		await onboard(alice, 'alice');
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await addLocation(alice, 'altstadt', 'Studio Altstadt');

		// A fourth device: the fixtures name three, and three is one hub and two
		// leaves — the shape already covered.
		const dave = await newActor(browser);
		const leaves = [bob, carol, dave];

		// Peer ids are read here, not where they are needed. `own-peer-id` lives on
		// the connection screen, and every leaf is navigated to the programme
		// further down — asking afterwards waits for an element that is no longer
		// rendered, which does not fail, it hangs until the test's whole budget is
		// gone. Cost a run of this to learn.
		/** @type {string[]} */
		const ids = [];

		// The third handshake fails on CI and only on CI — three times now, and each
		// time at the *full* budget rather than near it: 15 s, 12 s, then 180 s.
		// That is a cliff, not a slope, so a larger number is not the answer. What
		// is missing is which layer stops. #80.
		//
		// So every attempt reports what WebRTC and libp2p think, from both sides.
		// `__yoga.webrtc()` describes the peer connections *underneath* libp2p,
		// which is where a stalled handshake actually stalls — from above the only
		// symptom is a screen that never changes.
		const report = async (/** @type {string} */ when) => {
			for (const [name, page] of /** @type {const} */ ([
				['hub', alice],
				['leaf', leaves[ids.length]]
			])) {
				if (!page) continue;

				const state = await page
					.evaluate(() => ({
						webrtc: /** @type {any} */ (window).__yoga?.webrtc?.(),
						connections: /** @type {any} */ (window).__yoga?.connections?.()
					}))
					.catch(() => null);

				console.log(`[mesh ${when} #${ids.length + 1}] ${name}: ${JSON.stringify(state)}`);
			}
		};

		for (const leaf of leaves) {
			try {
				await connectViaPaste(alice, leaf, { connectTimeout: 180_000 });
			} catch (error) {
				await report('failed');
				throw error;
			}

			await report('connected');
			ids.push(await leaf.getByTestId('own-peer-id').innerText());
		}

		// Each of them found the studio, so the registry crossed the hub three
		// times over three separate handshakes.
		for (const leaf of leaves) {
			await expect(leaf.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
			await expect(leaf.getByTestId('join-status')).toContainText('Yoga Eggenfelden');
		}

		await expect(alice.getByTestId('device-list').locator('[data-peer]')).toHaveCount(3, READY);
		await expect(alice.getByTestId('connection-status')).toContainText('3');

		// --- a change made now, with all three watching ------------------------
		// The part a count cannot show: not "three devices are attached" but "a
		// write reaches all three". Live, over the connections that already exist,
		// which is where an ungrafted topic mesh goes quiet.
		await alice.getByTestId('nav-program').click();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await addCourse(alice, 'yin-fr-19', 'Yin Yoga');

		for (const leaf of leaves) {
			await leaf.getByTestId('nav-program').click();
			await expect(leaf.locator('[data-course-id="course:yin-fr-19"]')).toBeVisible(REPLICATED);
		}

		// --- and the right one leaves ------------------------------------------
		// With two devices, picking the wrong one still looks correct half the
		// time. With three it does not.
		await alice.getByTestId('nav-connect').click();

		const carolId = ids[leaves.indexOf(carol)];
		const list = alice.getByTestId('device-list');

		await list.locator(`[data-peer="${carolId}"]`).getByRole('button').click();

		await expect(list.locator('[data-peer]')).toHaveCount(2, READY);
		await expect(list.locator(`[data-peer="${carolId}"]`)).toHaveCount(0);
	});
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
