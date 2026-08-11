// The handshake itself (T2.1). Everything the app can do between two devices
// depends on this working, so it is the one scenario that must never be
// skipped or made conditional.

import {
	test,
	expect,
	connectViaCamera,
	connectViaPaste,
	onboard,
	openAdvanced,
	openConnect,
	readPayload
} from './fixtures.js';

test.describe('QR handshake', () => {
	test('connects two devices over copy & paste', async ({ alice, bob }) => {
		test.setTimeout(180_000);
		await connectViaPaste(alice, bob);
	});

	test('connects two devices through the camera', async ({ alice }) => {
		// The real decoder against a real MediaStream: the offer is rendered as a
		// QR video and handed to the answering browser as its webcam. This is the
		// path used at the front desk, and the one the plan requires in CI.
		test.setTimeout(240_000);

		await openConnect(alice, 'alice');
		const session = await connectViaCamera(alice, 'scanner');

		try {
			await expect(session.answerer.getByTestId('connection-status')).toHaveAttribute(
				'data-step',
				'connected',
				{ timeout: 90_000 }
			);
		} finally {
			await session.close();
		}
	});

	test('shows an invitation on its own, without being asked', async ({ alice }) => {
		// The whole point of the screen: no button was pressed here.
		await openConnect(alice, 'alice');

		await expect(alice.getByTestId('qr-image')).toBeVisible();
	});

	test('renders the offer as a scannable code carrying the invite link', async ({ alice }) => {
		await openConnect(alice, 'alice');

		const image = alice.getByTestId('qr-image');

		await expect(image).toBeVisible();

		// The code lives inside <qr-invite>'s shadow root. Playwright pierces it,
		// which is what lets a test see the same pixels a camera would.
		await expect(image.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/, {
			timeout: 30_000
		});

		// What the code encodes has to be the link, not the bare payload: a camera
		// that reads this must land on the app, not on a string.
		const link = /** @type {string} */ (await image.getAttribute('data-link'));
		const url = new URL(link);
		expect(url.pathname.endsWith('/connect')).toBe(true);
		expect(url.hash.startsWith('#i=')).toBe(true);

		// No character budget any more. A link too long for one code becomes an
		// animated sequence rather than an apology - which is why the branch that
		// used to check for `qr-too-large` is gone.
	});

	test('says nothing about the network when STUN was deliberately turned off', async ({
		alice
	}) => {
		// The suite runs with ?ice=host, which is a setting somebody chose. A
		// readiness panel that painted that red would report a fault where there is
		// a decision - so no address family and no summary appear in that mode.
		//
		// What does appear is the browser and the camera. Those two break the desk
		// just as badly with STUN off, and the panel used to hide them along with
		// the rows that had become meaningless.
		await openConnect(alice, 'alice');

		const panel = alice.getByTestId('network-status');

		await expect(panel).toBeVisible();
		await expect(panel.locator('.line')).toHaveCount(2);
		await expect(panel.locator('.line button span:first-child')).toHaveText(['Browser', 'Camera']);
	});

	test('labels the panel in the language of the page, not the package', async ({ alice }) => {
		// The elements come from @le-space/libp2p-webrtc-qr and ship English. Left
		// alone, the German page showed "Browser · IPv4 · IPv6 · Camera · Result"
		// under German headings — the one string on this screen that our own i18n
		// rule could not reach until the package grew a seam for it (upstream #51).
		// The locale has to be set the way the app reads it. Chromium reports
		// English, and in English the package defaults are already correct — so
		// asserting there would pass whether or not any of this is wired up.
		await alice.addInitScript(() => localStorage.setItem('PARAGLIDE_LOCALE', 'de'));

		await alice.goto('/connect/');
		await onboard(alice, 'alice');

		const panel = alice.getByTestId('network-status');
		await expect(panel).toBeVisible();

		await expect(panel.locator('.line button span:first-child')).toHaveText([
			'Browser',
			'IPv4',
			'IPv6',
			'Kamera',
			'Ergebnis'
		]);
	});

	test('shows all five readiness rows when STUN is in play', async ({ alice }) => {
		// The rest of the suite runs with ?ice=host, so without this the five-row
		// configuration - the whole of #26 - would never render in a test.
		//
		// Only the rows are asserted, never their colours. A verdict depends on a
		// STUN server being reachable from wherever this runs, and a test that
		// fails when Google's STUN is having a bad afternoon tells nobody anything
		// about this application. The labels appear when the element builds,
		// before any probe resolves.
		await alice.goto('/connect/');
		await onboard(alice, 'alice');

		const panel = alice.getByTestId('network-status');

		await expect(panel).toBeVisible();
		await expect(panel.locator('.line button span:first-child')).toHaveText([
			'Browser',
			'IPv4',
			'IPv6',
			'Camera',
			'Result'
		]);
	});

	test('answers an invitation carried in the address, with nothing to press', async ({
		alice,
		bob
	}) => {
		// The receiving half of the link flow, and the reason it is worth building:
		// bob opens a URL and produces a reply without touching a control.
		await openConnect(alice, 'alice');
		const link = /** @type {string} */ (
			await alice.getByTestId('qr-image').getAttribute('data-link')
		);

		await openConnect(bob, 'bob');
		await bob.goto(link);

		await expect(bob.getByTestId('connection-status')).toHaveAttribute('data-step', 'replying', {
			timeout: 90_000
		});

		// And the handshake must not be left lying in the address bar afterwards.
		expect(await bob.evaluate(() => location.hash)).toBe('');
	});

	test('refuses an offer created by the same device', async ({ alice }) => {
		await openConnect(alice, 'alice');

		await openAdvanced(alice);
		const ownOffer = await readPayload(alice);
		await alice.getByTestId('inbound-payload').fill(ownOffer);
		await alice.getByTestId('submit-inbound').click();

		await expect(alice.getByTestId('connection-status')).toHaveAttribute('data-step', 'failed');
	});

	test('refuses a payload that was tampered with', async ({ alice, bob }) => {
		await openConnect(alice, 'alice');
		await openConnect(bob, 'bob');

		await openAdvanced(alice);
		await openAdvanced(bob);
		const offer = await readPayload(alice);

		// Flip a character in the middle: the signature covers the payload, so a
		// modified offer must not produce a connection.
		const middle = Math.floor(offer.length / 2);
		const tampered =
			offer.slice(0, middle) + (offer[middle] === 'A' ? 'B' : 'A') + offer.slice(middle + 1);

		await bob.getByTestId('inbound-payload').fill(tampered);
		await bob.getByTestId('submit-inbound').click();

		await expect(bob.getByTestId('connection-status')).toHaveAttribute('data-step', 'failed');
	});
});

test.describe('share flow', () => {
	test('hands the payload to the share sheet when the device has one', async ({ alice }) => {
		await alice.addInitScript(() => {
			// @ts-expect-error — installing the API the desktop browser lacks
			navigator.share = (data) => {
				// @ts-expect-error — test-only channel
				window.__shared = data;
				return Promise.resolve();
			};
		});

		await openConnect(alice, 'alice');
		await openAdvanced(alice);
		const payload = await readPayload(alice);

		await alice.getByTestId('share-payload').click();

		// The share sheet gets the link, not the raw payload — that is the whole
		// upgrade. The payload still has to be inside it, or the link is useless.
		const shared = await alice.evaluate(() => /** @type {any} */ (window).__shared);
		expect(shared.text).toMatch(/^https?:\/\/.+#i=/);
		expect(decodeURIComponent(new URL(shared.text).hash.slice('#i='.length))).toBe(payload);
	});

	test('falls back to the clipboard where there is no share sheet', async ({ alice }) => {
		await openConnect(alice, 'alice');
		await openAdvanced(alice);
		const payload = await readPayload(alice);

		await alice.getByTestId('share-payload').click();

		// The clipboard gets the same link the share sheet would have sent, so a
		// device without one loses the convenience and nothing else.
		const clipboard = await alice.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toMatch(/^https?:\/\/.+#i=/);
		expect(decodeURIComponent(new URL(clipboard).hash.slice('#i='.length))).toBe(payload);
	});
});

test.describe('a reply that arrives in a new tab', () => {
	test('hands the reply to the tab that made the invitation, and says so', async ({
		alice,
		bob
	}) => {
		// The messenger scenario, end to end. Alice invites, Bob answers, Alice
		// taps the reply link in a chat — which opens a *new* tab. That tab holds
		// no offer, so without a handoff it fails and Alice's first tab waits for
		// an answer that already arrived.
		test.setTimeout(240_000);

		await openConnect(alice, 'alice');
		const invite = /** @type {string} */ (
			await alice.getByTestId('qr-image').getAttribute('data-link')
		);

		await openConnect(bob, 'bob');
		await bob.goto(invite);
		await expect(bob.getByTestId('connection-status')).toHaveAttribute('data-step', 'replying', {
			timeout: 90_000
		});

		const reply = /** @type {string} */ (
			await bob.getByTestId('qr-image').getAttribute('data-link')
		);

		// The tap in the messenger: a second tab in Alice's browser, same context,
		// so it shares the origin and the BroadcastChannel with the first.
		const secondTab = await alice.context().newPage();
		await secondTab.goto(reply);

		await expect(secondTab.getByTestId('handed-over')).toBeVisible({ timeout: 90_000 });

		// The point of the whole exercise: the tab that owned the offer connected.
		await expect(alice.getByTestId('connection-status')).toHaveAttribute('data-step', 'connected', {
			timeout: 90_000
		});

		await secondTab.close();
	});

	test('explains an orphaned reply instead of quoting the internals', async ({ alice, bob }) => {
		// Same link, but no tab anywhere owns that invitation — Alice reopened the
		// app, or tapped a reply meant for another device. The message has to tell
		// her what to do, not report a session id mismatch.
		test.setTimeout(240_000);

		await openConnect(alice, 'alice');
		const invite = /** @type {string} */ (
			await alice.getByTestId('qr-image').getAttribute('data-link')
		);

		await openConnect(bob, 'bob');
		await bob.goto(invite);
		await expect(bob.getByTestId('connection-status')).toHaveAttribute('data-step', 'replying', {
			timeout: 90_000
		});
		const reply = /** @type {string} */ (
			await bob.getByTestId('qr-image').getAttribute('data-link')
		);

		// A second tab in Bob's browser: it shares the channel with Bob's tab, but
		// no tab here owns the invitation this reply answers — Bob made the reply,
		// he did not make the offer.
		const stranger = await bob.context().newPage();
		await stranger.goto(reply);

		await expect(stranger.getByTestId('connection-status')).toHaveAttribute('data-step', 'failed', {
			timeout: 90_000
		});
		await expect(stranger.getByTestId('connection-status')).toContainText(/Einladung|invitation/i);

		await stranger.close();
	});
});
