// Short codes — the compact (v3) payload, off by default.
//
// Two things are worth proving here, and only one of them is about size.
//
// The first is the benefit, and it is not "a sparser code": above 600 characters
// `<qr-invite>` splits the invitation into an animated sequence whose frames are
// small by construction, so the long payload draws several codes of roughly the
// same density rather than one dense one. What a short code buys is therefore
// *one* code — a glance at the counter instead of holding a phone steady through
// a sequence. So the test measures frames, not characters.
//
// The second is the risk, and it is the reason the whole thing is off by default:
// upstream measured four of eight connections under load coming up with both
// peers holding an open stream that carried no bytes. No error, no dropped
// connection, simply nothing arriving. A test that stopped at
// `connection-status = connected` would pass *in exactly that failure mode*, so
// the connection test here goes on to make Bob join Alice's studio: her registry
// reaching his device is bytes crossing the link, and nothing else here is.

import {
	test,
	expect,
	connectViaPaste,
	enableShortCode,
	onboard,
	openAdvanced,
	openConnect,
	currentPayload
} from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('what a short code changes about the invitation', () => {
	test('turns a sequence of codes into a single one', async ({ alice }) => {
		test.setTimeout(240_000);

		await openConnect(alice, 'alice');
		await openAdvanced(alice);

		// `<qr-invite>` reports what it drew. Listening is the only way to know the
		// frame count: a sequence and a single code look the same in the DOM, one
		// <img> whose src is being swapped.
		//
		// Bound to the document rather than to the element, because the element is
		// not permanent: renewing an invitation takes the spent code off screen
		// while the replacement is built, so a listener held by the instance
		// standing there now goes away with it and records nothing. In the capture
		// phase because `render` does not bubble — capture reaches an ancestor
		// either way, `bubbles` only decides the trip back up.
		await alice.evaluate(() => {
			/** @type {any} */ (window).__renders = [];
			document.addEventListener(
				'render',
				(/** @type {any} */ event) => /** @type {any} */ (window).__renders.push(event.detail),
				true
			);
		});

		// A render the listener is present for. The first one happened while the
		// screen was setting itself up, before there was anywhere to record it.
		await alice.getByTestId('refresh-invite').click();
		const long = await renderAfter(alice, 0);

		await enableShortCode(alice);
		const short = await renderAfter(alice, 1);

		expect(long.frames).toBeGreaterThan(1);
		expect(short.frames).toBe(1);

		// Upstream measures 266 characters against 1057. Asserting "less than half"
		// rather than a figure: the exact length moves with the candidate list, and
		// a test that pins it would go red on a machine with a second network
		// interface while nothing was wrong.
		expect(short.characters).toBeLessThan(long.characters / 2);
	});

	test('is not what a device hands out until somebody asks for it', async ({ alice }) => {
		// The default is the whole safety argument, and it is worth one assertion
		// against the running application rather than only against the module that
		// stores it.
		await openConnect(alice, 'alice');
		await openAdvanced(alice);

		await expect(alice.getByTestId('short-code')).not.toBeChecked();
		expect(await currentPayload(alice)).not.toMatch(/^q3:/);
	});

	test('is still switched on after the app is closed and reopened', async ({ alice }) => {
		// A studio decides this once. Having to find the checkbox again every
		// morning would mean it is not really supported.
		await openConnect(alice, 'alice');
		await enableShortCode(alice);

		await alice.reload();
		await openAdvanced(alice);

		await expect(alice.getByTestId('short-code')).toBeChecked(READY);
		await expect
			.poll(async () => (await currentPayload(alice)).startsWith('q3:'), { timeout: 90_000 })
			.toBe(true);
	});
});

test.describe('a connection built from a short code', () => {
	test('carries Alice’s studio to Bob, not just an open stream', async ({ alice, bob }) => {
		test.setTimeout(420_000);

		await onboardAt(alice, 'alice');
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		// Only Alice hands out the short code. Bob never touches the setting, which
		// is the other half of what "supported" means: reading is unconditional, so
		// a device with it off answers a short code from a device that has it on —
		// and the answer travels back in the format the offer arrived in.
		await connectViaPaste(alice, bob, { shortCode: true });

		expect(await currentPayload(alice)).toMatch(/^q3:/);
		await expect(bob.getByTestId('short-code')).not.toBeChecked();

		// The assertion the silent-connection failure mode would not survive.
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await expect(bob.getByTestId('join-status')).toContainText('Yoga Eggenfelden');
	});
});

/**
 * The render report at `index`, once it has arrived.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 * @returns {Promise<{ frames: number, modules: number, characters: number }>}
 */
async function renderAfter(page, index) {
	await expect
		.poll(async () => page.evaluate(() => /** @type {any} */ (window).__renders?.length ?? 0), {
			timeout: 90_000
		})
		.toBeGreaterThan(index);

	return page.evaluate(
		(/** @type {number} */ at) => /** @type {any} */ (window).__renders[at],
		index
	);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} who
 */
async function onboardAt(page, who) {
	await page.goto('/studio/?ice=host');
	await expect(page.getByTestId('onboarding')).toBeVisible(READY);
	await onboard(page, who);
}
