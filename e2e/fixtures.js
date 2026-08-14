// Named browser contexts and the handshake helpers every spec builds on.
//
// Roles follow docs/PLAN.md: alice owns the studio and works location A,
// carol is the front desk at location B, bob is the student who carries his
// own ledger between the two. Each gets its own storage partition, so their
// OrbitDB state and passkey identity never bleed into one another.

import { chromium, test as base, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addVirtualAuthenticator } from './webauthn.js';
import { writeQrVideo } from './qr-video.js';

/**
 * `?ice=host` restricts ICE to host candidates: no STUN lookup, no dependency
 * on the CI runner's egress, and a deterministic candidate set. Remote/NAT
 * paths are a benchmark concern (docs/PLAN.md §11), not a PR gate concern.
 */
export const CONNECT_URL = '/connect/?ice=host';

/**
 * @typedef {import('@playwright/test').Page} Page
 */

export const test = base.extend({
	/** The studio owner, location A. */
	alice: async ({ browser }, use) => {
		await use(await newActor(browser));
	},
	/** Front desk, location B. */
	carol: async ({ browser }, use) => {
		await use(await newActor(browser));
	},
	/** Student and sync courier. */
	bob: async ({ browser }, use) => {
		await use(await newActor(browser));
	}
});

/**
 * A fresh device: own storage partition, own passkey authenticator.
 *
 * Exported because the remote scenario builds its devices from browsers this
 * file never launched - one local, one somewhere else entirely - and a second
 * copy of this would drift from the fixtures the rest of the suite uses.
 *
 * @param {import('@playwright/test').Browser} browser
 */
export async function newActor(browser) {
	const context = await browser.newContext({
		permissions: ['clipboard-read', 'clipboard-write'],
		// Normally unset, so the app follows the runner the way it follows a device.
		// The screenshot run sets it, because a handbook in two languages needs its
		// pictures in two languages — and a German page showing an English screen is
		// the sort of thing a reader trusts less than plain text.
		...(process.env.SCREENSHOT_LOCALE ? { locale: process.env.SCREENSHOT_LOCALE } : {})
	});
	const page = await context.newPage();
	// Kept on the page so a test can model "same person, new device": the passkey
	// lives in the authenticator, so carrying it is the only honest way to do that.
	page.__cdp = await addVirtualAuthenticator(page);
	return page;
}

/**
 * Give a context an identity, if it does not have one yet.
 *
 * Every screen that touches data is gated on a passkey — including the
 * connection assistant, because a connection is only worth anything once the
 * device has an identity the other side can grant something to.
 *
 * @param {Page} page
 * @param {string} who used for the passkey's user id and display name
 */
export async function onboard(page, who) {
	const onboarding = page.getByTestId('onboarding');
	const ready = page.getByTestId('studio-ready');

	// Wait for the gate to decide before asking which side it landed on.
	// `isVisible()` does not auto-wait, so checking it straight after a
	// navigation reads "not visible" simply because nothing has rendered yet —
	// the form then never gets filled and the wait below times out.
	await expect(onboarding.or(ready)).toBeVisible({ timeout: 90_000 });

	if (await onboarding.isVisible()) {
		await page.getByTestId('onboarding-user-id').fill(`${who}@example.com`);
		await page.getByTestId('onboarding-display-name').fill(who);
		await page.getByTestId('onboarding-submit').click();
	}

	await expect(ready).toBeVisible({ timeout: 90_000 });
}

/**
 * Open the connection assistant, onboarding on the way if needed.
 *
 * Note what this does *not* control: the ICE mode. A page that already runs a
 * node navigates in-app, so no query string is applied - and the mode is read
 * from the URL once and then kept in sessionStorage. A run that needs STUN has
 * to load the connect page itself, before calling this. See e2e/remote.
 *
 * @param {Page} page
 * @param {string} who
 */
export async function openConnect(page, who) {
	// Navigate in-app when this page already runs a node. `page.goto` is a full
	// load, which rebuilds libp2p, Helia and OrbitDB from scratch — the single
	// biggest cost in this suite, and pure waste when the stack the test needs
	// is already up. The app routes client-side, so a nav click keeps it.
	const running = await page.evaluate(() => Boolean(window.__yoga)).catch(() => false);

	if (running) {
		await page.getByTestId('nav-connect').click();
	} else {
		await page.goto(CONNECT_URL);
		await onboard(page, who);
	}

	// The invitation is made by the screen itself now, so "ready" is no longer a
	// button being enabled — it is the screen having got past 'preparing'.
	//
	// Deliberately "anything but preparing" rather than "inviting": a page that
	// is already connected reopens on 'connected' and never goes back to
	// offering. Waiting for 'inviting' there waits for something that will not
	// happen, which is what it did until CI ran the booking scenarios.
	await expect
		.poll(() => page.getByTestId('connection-status').getAttribute('data-step'), {
			timeout: 90_000
		})
		.not.toBe('preparing');
}

/**
 * Open the "advanced" disclosure that holds the copy & paste fallback.
 *
 * It is closed by default on purpose (see the connect screen), so every test
 * that drives the paste path has to open it first. Idempotent: a <details> that
 * is already open stays open.
 *
 * @param {Page} page
 */
export async function openAdvanced(page) {
	const toggle = page.getByTestId('advanced-toggle');
	const inbound = page.getByTestId('inbound-payload');

	if (await inbound.isVisible()) return;

	await toggle.click();
	await expect(inbound).toBeVisible();
}

/**
 * Turn short codes on, and wait until the invitation on screen is one.
 *
 * Ticking the box rebuilds the invitation, which means the payload field holds
 * the old format for as long as ICE takes to gather again. Returning before that
 * finished would hand the caller a v2 payload and call it a short code.
 *
 * @param {Page} page
 */
export async function enableShortCode(page) {
	await openAdvanced(page);
	await page.getByTestId('short-code').check();

	await expect
		.poll(async () => (await currentPayload(page)).startsWith('q3:'), { timeout: 90_000 })
		.toBe(true);
}

/**
 * Run the full three-step handshake over copy & paste.
 *
 * This is the default for the bulk of the suite: it exercises the same
 * signalling code as the camera path without depending on video decoding, so
 * a failure here is never ambiguous about which layer broke.
 *
 * @param {Page} offerer
 * @param {Page} answerer
 * @param {{ shortCode?: boolean }} [options] have the offering device hand out a
 *   compact (v3) payload. Only the offerer is asked: the answer comes back in
 *   whatever format the offer arrived in, which is itself worth exercising.
 */
export async function connectViaPaste(offerer, answerer, { shortCode = false } = {}) {
	// Already-onboarded contexts pass straight through; a fresh one gets an
	// identity here rather than failing at a form it did not expect.
	await openConnect(offerer, 'offerer');
	await openConnect(answerer, 'answerer');

	await openAdvanced(offerer);
	await openAdvanced(answerer);

	if (shortCode) await enableShortCode(offerer);

	// Capture what each field holds before acting, so the reads below can wait
	// for a *new* value rather than any value.
	const previousAnswer = await currentPayload(answerer);

	// No "create offer" step any more: openConnect already waited for the screen
	// to stand one up by itself. Read it rather than ask for it.
	const offer = await readPayload(offerer);

	await answerer.getByTestId('inbound-payload').fill(offer);
	await answerer.getByTestId('submit-inbound').click();
	const answer = await readPayload(answerer, { changedFrom: previousAnswer });

	await offerer.getByTestId('inbound-payload').fill(answer);
	await offerer.getByTestId('submit-inbound').click();

	await expect(offerer.getByTestId('connection-status')).toHaveAttribute('data-step', 'connected', {
		timeout: 60_000
	});
	await expect(answerer.getByTestId('connection-status')).toHaveAttribute(
		'data-step',
		'connected',
		{ timeout: 60_000 }
	);
}

/**
 * Wait for a payload to appear and return it.
 *
 * Polls the value rather than reading it once: creating an offer waits for ICE
 * gathering, so the textarea is empty for a moment after the click.
 *
 * @param {Page} page
 */
/**
 * What the payload field holds right now, or '' when it does not exist yet.
 *
 * The field only renders once there is a payload, so asking a fresh device for
 * its current value would wait for an element that is not coming.
 *
 * @param {Page} page
 */
export async function currentPayload(page) {
	const field = page.getByTestId('payload');
	return (await field.count()) > 0 ? field.inputValue() : '';
}

export async function readPayload(page, { changedFrom = '' } = {}) {
	const field = page.getByTestId('payload');

	// Waiting for "not empty" is not enough on a page that already ran a
	// handshake: the field still holds the previous payload, so the read races
	// the new one and can hand back a stale offer. The peer then answers an
	// offer the other side has already replaced, and the session ids disagree.
	await expect
		.poll(
			async () => {
				const value = await field.inputValue();
				return value.length > 0 && value !== changedFrom;
			},
			{ timeout: 60_000 }
		)
		.toBe(true);

	return field.inputValue();
}

export { expect };

/**
 * Run the handshake through the camera, not the clipboard.
 *
 * The offer is rendered as a QR video file and fed to a second browser as its
 * webcam, so the app's own decoder runs against a real MediaStream. That is the
 * difference between testing the scan path and testing a mock of it — and the
 * scan path is the one used at the front desk.
 *
 * The fake-camera file has to exist before the browser starts (it is a launch
 * flag, not a context option), which is why the answering side gets a browser
 * of its own rather than another context.
 *
 * @param {Page} offerer already onboarded and on the connect screen
 * @param {string} who a name for the answering device's passkey
 * @returns {Promise<{ answerer: Page, close: () => Promise<void> }>}
 */
export async function connectViaCamera(offerer, who = 'scanner') {
	// A payload too large for one code is a real limit, not a test problem
	// (docs/LIMITS.md §1.6) — say so rather than fail somewhere in the decoder.
	const image = offerer.getByTestId('qr-image');
	await expect(
		image,
		'the offer must fit in a scannable QR code for the camera path'
	).toBeVisible();

	// Photograph what the code actually encodes — the invite link — rather than
	// the bare payload sitting in the advanced panel. Encoding the wrong one
	// would make this path pass while a real camera read something else.
	const offer = /** @type {string} */ (await image.getAttribute('data-link'));

	const directory = mkdtempSync(join(tmpdir(), 'yoga-qr-'));
	const video = join(directory, 'offer.y4m');
	writeQrVideo({ text: offer, path: video });

	const browser = await chromium.launch({
		args: [
			'--use-fake-ui-for-media-stream',
			'--use-fake-device-for-media-stream',
			`--use-file-for-fake-video-capture=${video}`,
			// Same reason as in playwright.config.js: headless Chromium backgrounds
			// a page nobody is looking at and throttles the timers the handshake
			// waits on. This browser is launched by hand, so it does not inherit
			// the project's arguments and needs its own copy.
			'--disable-background-timer-throttling',
			'--disable-backgrounding-occluded-windows',
			'--disable-renderer-backgrounding'
		]
	});

	const context = await browser.newContext({
		permissions: ['camera', 'clipboard-read', 'clipboard-write']
	});
	const answerer = await context.newPage();
	await addVirtualAuthenticator(answerer);

	await answerer.goto(CONNECT_URL);
	await onboard(answerer, who);
	await expect(answerer.getByTestId('scan-qr')).toBeEnabled({ timeout: 90_000 });

	// The answering device now shows an invitation of its own from the moment it
	// opens, so "the payload on screen" is ambiguous until the scan replaces it.
	// Capture it first and wait for a *different* one, or this reads back the
	// answerer's own offer and the two sides talk past each other.
	await openAdvanced(answerer);
	const previousAnswer = await currentPayload(answerer);

	// Scanning replaces the paste step entirely: the decoded offer runs through
	// the same handler a pasted one would.
	await answerer.getByTestId('scan-qr').click();

	const answer = await readPayload(answerer, { changedFrom: previousAnswer });

	await openAdvanced(offerer);
	await offerer.getByTestId('inbound-payload').fill(answer);
	await offerer.getByTestId('submit-inbound').click();

	await expect(offerer.getByTestId('connection-status')).toHaveAttribute('data-step', 'connected', {
		timeout: 90_000
	});

	return {
		answerer,
		close: async () => {
			await context.close();
			await browser.close();
		}
	};
}
