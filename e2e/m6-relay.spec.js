// Two devices that never saw each other's screen.
//
// Every other connection in this suite starts with a QR code: somebody holds a
// phone up, somebody else scans it. That is the default and stays it. This is
// the second way in — a relay somebody switched on, peers that find each other
// through it, and OrbitDB replicating without anyone picking a peer from a list
// (#94).
//
// Against the suite's own relay rather than the production one, and its limits
// are tiny (e2e/relay/server.mjs). Both choices are the test: a suite that
// depends on a machine on the internet produces red runs that say nothing about
// this code, and a relay with production limits can only be asked whether a
// connection *exists* — which is true of a circuit that is one second from
// expiring.

import {
	connectViaPaste,
	expect,
	onboard as onboardVia,
	openCourseForm,
	openProgramme,
	test
} from './fixtures.js';
import { RELAY_ADDRESS } from './relay/server.mjs';

const FOUND = { timeout: 120_000 };
/** Hole punching is not instant, and on a busy machine it is much less so. */
const UPGRADED = { timeout: 120_000 };

/** Replication across a relayed connection, not a click. */
const REPLICATED = { timeout: 120_000 };

/** The relay's own limit, from e2e/relay/server.mjs. */
const RELAY_DURATION_LIMIT_MS = 30_000;

/**
 * Switch the relay on before the app boots.
 *
 * `addInitScript` rather than a click, and not for speed: the setting is read
 * when the node is built, so a device that starts without it has already made
 * its decision. The screen says as much — the checkbox takes effect on the next
 * start — and a test that ticked it would be testing the checkbox rather than
 * the relay.
 */
async function withRelay(page) {
	await page.addInitScript((address) => {
		localStorage.setItem('yogasuci:relay', 'on');
		localStorage.setItem('yogasuci:relay-address', address);
	}, RELAY_ADDRESS);
}

/** @param {import('@playwright/test').Page} page */
function connections(page) {
	return page.evaluate(() => window.__yoga?.connections?.() ?? []);
}

/**
 * This device's peer id, once there is a node to ask.
 *
 * `window.__yoga` is installed by the node as it starts, so it is present the
 * moment onboarding finishes — and absent again for a while after a reload,
 * which is where reading it directly threw `Cannot read properties of
 * undefined`. Waiting is the whole difference.
 *
 * @param {import('@playwright/test').Page} page
 */
async function peerIdOf(page) {
	await expect
		.poll(() => page.evaluate(() => window.__yoga?.peerId?.() ?? null), FOUND)
		.not.toBeNull();

	return page.evaluate(() => window.__yoga.peerId());
}

test.describe('two devices that never scanned anything', () => {
	test('find each other through the relay', async ({ alice, bob }) => {
		test.setTimeout(300_000);

		await withRelay(alice);
		await withRelay(bob);

		await alice.goto('/connect/');
		await onboardVia(alice, 'alice');
		await bob.goto('/connect/');
		await onboardVia(bob, 'bob');

		const aliceId = await alice.evaluate(() => window.__yoga.peerId());
		const bobId = await bob.evaluate(() => window.__yoga.peerId());
		expect(aliceId).not.toBe(bobId);

		// No handshake anywhere above this line: no code was read, no payload
		// pasted, no link opened.
		await expect
			.poll(async () => (await connections(alice)).some((c) => c.peer === bobId), FOUND)
			.toBe(true);
	});

	test('says how the connection is carried, and it outlives the relay’s limit', async ({
		alice,
		bob
	}) => {
		// The assertion this file exists for. A relayed connection is bounded by
		// design — the relay grants it a duration — so "connected" on its own is
		// compatible with a connection that is about to end. What has to be true is
		// that something carries the data *after* that limit has passed: either the
		// peers hole punched onto a direct path, or the relay is granting circuits
		// without limits. Either is a pass; neither being true is the failure this
		// catches.
		test.setTimeout(300_000);

		await withRelay(alice);
		await withRelay(bob);

		await alice.goto('/connect/');
		await onboardVia(alice, 'alice');
		await bob.goto('/connect/');
		await onboardVia(bob, 'bob');

		const bobId = await bob.evaluate(() => window.__yoga.peerId());

		await expect
			.poll(async () => (await connections(alice)).some((c) => c.peer === bobId), FOUND)
			.toBe(true);

		const first = (await connections(alice)).find((c) => c.peer === bobId);
		console.log(`[relay] first connection: ${first?.address} limited=${first?.limited}`);

		// Wait for the upgrade before timing anything. Two separate claims live in
		// this test — that a relayed connection *becomes* direct, and that what
		// remains outlives the relay's limit — and folding them together made the
		// first one fail whenever the machine was busy enough for ICE to miss the
		// window. A device that never upgrades fails here, which is the point.
		await expect
			.poll(async () => {
				const c = (await connections(alice)).find((x) => x.peer === bobId);
				return Boolean(c && !c.limited && c.address.includes('/webrtc'));
			}, UPGRADED)
			.toBe(true);

		// Past the relay's own limit, with a margin. Thirty seconds rather than the
		// twenty minutes a real relay grants — which is the whole reason the suite
		// runs its own.
		await alice.waitForTimeout(RELAY_DURATION_LIMIT_MS + 6_000);

		const later = (await connections(alice)).find((c) => c.peer === bobId);
		console.log(`[relay] after the limit: ${later?.address} limited=${later?.limited}`);

		expect(later, 'the connection did not survive the relay’s duration limit').toBeDefined();
		expect(later?.status).toBe('open');
	});
});

test.describe('a device that has been here before', () => {
	test('is handed a new course with nothing scanned this time', async ({ alice, bob }) => {
		// The last of #94's Phase 4, and the one that is about OrbitDB rather than
		// libp2p: a connection that carries no data proves nothing, so this asks
		// for a document that did not exist when the two devices last met.
		//
		// The framing matters, because the checkbox as written — "replicates with
		// nobody selecting a peer" — has a reading this test deliberately refuses.
		// Acting on *any* peer heard on the discovery topic would mean a device
		// joining studios it has never agreed to, which is the exposure the issue
		// is trying to avoid. What is proven here is the useful half: a student who
		// joined once comes back next week and finds the new programme. Her device
		// reopens addresses it already had (`openJoinedStudios` on boot); discovery
		// supplies only the connection, and nobody new is trusted.
		//
		// So there is one scan, and it happens before the reload. Everything the
		// assertion depends on happens after it.
		test.setTimeout(420_000);

		await withRelay(alice);
		await withRelay(bob);

		// The studio and its rooms live on /studio/, the programme on /program/;
		// `connectViaPaste` brings both devices to /connect/ by itself.
		await alice.goto('/studio/?ice=host');
		await onboardVia(alice, 'alice');
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await alice.getByTestId('location-id').fill('altstadt');
		await alice.getByTestId('location-name-de').fill('Studio Altstadt');
		await alice.getByTestId('location-name-en').fill('Old Town Studio');
		await alice.getByTestId('location-add').click();
		await expect(alice.locator('[data-location-id="location:altstadt"]')).toBeVisible(FOUND);

		await openProgramme(alice);
		await addCourse(alice, 'vinyasa-mi-18', 'Vinyasa Flow');

		await connectViaPaste(alice, bob);

		// The visit that makes Bob's device one that "has been here before". Also
		// the control for the assertion below: without it, a Bob who never received
		// anything and a Bob who received only the first course look the same.
		await openProgramme(bob);
		await expect(
			bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		).toBeVisible(REPLICATED);

		// Next week. The reload is what makes this a test rather than a
		// restatement: the WebRTC connection the scan produced does not survive it,
		// and no code is read afterwards, so anything that reaches Bob from here
		// arrives over a connection the relay introduced.
		await alice.reload();
		await bob.reload();

		// The control, and it is what makes a red run readable. Two quite different
		// things can stop the assertion at the end of this test: the studio might
		// not come back at all after a restart, or it might come back and receive
		// nothing new. This separates them — the first course is already in Bob's
		// own store, so it renders from local data with no connection to anyone.
		// Whatever happens below, this line has already said which half broke.
		await openProgramme(bob);
		await expect(
			bob.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		).toBeVisible(REPLICATED);

		const bobId = await peerIdOf(bob);
		await expect
			.poll(async () => (await connections(alice)).some((c) => c.peer === bobId), FOUND)
			.toBe(true);

		const carried = (await connections(alice)).find((c) => c.peer === bobId);
		console.log(`[relay] after the reload: ${carried?.address} limited=${carried?.limited}`);

		// A course that did not exist when the two devices last saw each other.
		await openProgramme(alice);
		await addCourse(alice, 'yin-do-19', 'Yin Yoga');

		await expect(
			bob.locator('[data-testid="course-item"][data-course-id="course:yin-do-19"]')
		).toBeVisible(REPLICATED);
	});
});

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

	await expect(
		page.locator(`[data-testid="course-item"][data-course-id="course:${id}"]`)
	).toBeVisible(REPLICATED);
}
