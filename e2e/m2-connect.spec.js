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

	test('the readiness panel speaks the language the page is in', async ({ alice }) => {
		// The elements ship English defaults, which is the right default for the
		// package and wrong inside a German screen. Without the strings table the
		// seam exists and the surface stays mixed - the state that looks finished
		// and is not.
		await alice.goto('/connect/?ice=host');
		await onboard(alice, 'alice');

		const labels = alice.getByTestId('network-status').locator('.line button span:first-child');

		// The suite runs in English, so this starts as the package's own default.
		await expect(labels).toHaveText(['Browser', 'Camera']);

		// Switching reloads the page - paraglide's setLocale does that - so this
		// also proves the table is applied on a fresh mount rather than only on
		// the one the test happened to start with.
		await alice.getByTestId('language-de').click();
		await expect(alice.getByTestId('network-status')).toBeVisible({ timeout: 120_000 });

		// "Browser" is the same word in both languages, so it proves nothing on
		// its own. "Kamera" is what shows the table actually reached the element.
		await expect(labels).toHaveText(['Browser', 'Kamera']);
	});

	test('leaves no English default showing in a German screen', async ({ alice }) => {
		// The test above checks two labels, which is what a person can see. This
		// checks the whole table, which is what actually goes wrong: the seam merges
		// over the package's defaults, so a key nobody translated is not missing —
		// it is present, in English, looking finished.
		//
		// That is not hypothetical. 0.8.0 added `measuring`, `alarm` and
		// `alarmUnreliable`, and the two alarms are paragraphs. Untranslated they
		// would have put English prose in front of a studio at the one moment the
		// screen has something urgent to say.
		//
		// Written against every key rather than those three, so the next key added
		// upstream fails here instead of shipping.
		await alice.goto('/connect/?ice=host');
		await onboard(alice, 'alice');
		await alice.getByTestId('language-de').click();
		await expect(alice.getByTestId('network-status')).toBeVisible({ timeout: 120_000 });

		// Both tables come out of the running page. The defaults from a fresh
		// element nobody has assigned to — `strings` starts as a copy of
		// QR_STATUS_STRINGS — rather than from an import, because importing the
		// barrel in node defines custom elements and dies on `HTMLElement`.
		//
		// The merged table rather than the rendered rows: `alarm` and
		// `alarmUnreliable` only render on a network verdict this test cannot
		// arrange, and those are precisely the two worth checking.
		const { defaults, merged } = await alice.evaluate(() => ({
			defaults: /** @type {any} */ (document.createElement('qr-status')).strings,
			merged: /** @type {any} */ (document.querySelector('qr-status'))?.strings
		}));

		expect(merged).toBeTruthy();
		expect(Object.keys(defaults).length).toBeGreaterThan(9);

		// Words German keeps as they are. Listed rather than skipped silently: if
		// one of them ever gets a German form, this list is where to notice.
		const SAME_IN_BOTH = new Set(['browser', 'ipv4', 'ipv6']);

		const untranslated = Object.entries(defaults)
			.filter(([key, english]) => !SAME_IN_BOTH.has(key) && merged[key] === english)
			.map(([key]) => key);

		expect(untranslated).toEqual([]);
	});

	test('says nothing about reaching anyone when STUN was turned off', async ({ alice }) => {
		// Without STUN nothing reflexive is gathered, so the probe reports `blocked`
		// — truthfully, and about a setting somebody chose. This is #26 again: a
		// decision painted as a fault is worse than silence. It is also what keeps
		// the rest of the suite from running under a red banner, which is why it is
		// asserted rather than assumed.
		await openConnect(alice, 'alice');

		await expect(alice.getByTestId('network-status')).toBeVisible();
		await expect(alice.getByTestId('share-risk')).toHaveCount(0);
	});

	for (const [state, risk] of [
		['symmetric', 'unreliable'],
		['blocked', 'blocked']
	]) {
		test(`advises against sending an invitation when the network is ${state}`, async ({
			alice
		}) => {
			// The verdict is fed in rather than provoked. A real one depends on what
			// STUN says from wherever this runs, and the panel's own tests already
			// refuse to assert colours for that reason — a test that goes red when
			// Google's STUN has a bad afternoon says nothing about this application.
			// What is ours, and what this checks, is the wiring from the probe event
			// to the sentence beside the share button.
			await alice.goto('/connect/');
			await onboard(alice, 'alice');
			await expect(alice.getByTestId('share-payload')).toBeVisible({ timeout: 120_000 });

			// Dispatched inside the poll because the element's own probe resolves
			// whenever the network lets it and would overwrite a single injection.
			// Re-sending until it holds is race-free in a way that waiting a fixed
			// time is not.
			await expect
				.poll(
					async () => {
						await alice.evaluate((overallState) => {
							document
								.querySelector('qr-status')
								?.dispatchEvent(
									new CustomEvent('probe', { detail: { overall: { state: overallState } } })
								);
						}, state);

						return alice
							.getByTestId('share-risk')
							.getAttribute('data-risk')
							.catch(() => null);
					},
					{ timeout: 60_000 }
				)
				.toBe(risk);

			// The code itself is untouched. Two devices in the same room connect over
			// host candidates whatever this verdict says, and disabling the thing that
			// works to protect the thing that rarely happens would be the wrong trade.
			await expect(alice.getByTestId('qr-image')).toBeVisible();
			await expect(alice.getByTestId('share-payload')).toBeEnabled();
		});
	}

	test('keeps the screen awake while a code is on it, and lets it go after', async ({
		alice,
		bob
	}) => {
		// A phone lying on the counter with an invitation showing goes dark in
		// fifteen seconds, while the other person is still getting their own phone
		// out. Nothing about that is a connection fault; the screen simply left.
		test.setTimeout(420_000);

		await openConnect(alice, 'alice');

		const status = alice.getByTestId('connection-status');

		// The invitation is on screen from the moment this page opens.
		await expect(status).toHaveAttribute('data-wake-lock', 'true', { timeout: 90_000 });

		await connectViaPaste(alice, bob);

		// The code came down when the connection came up, so there is nothing left
		// to read — and a lock left behind would hold a studio's tablet awake for
		// the rest of the day.
		await expect(status).toHaveAttribute('data-wake-lock', 'false', { timeout: 90_000 });

		// Asked for again the moment a code is back, which is the case a front desk
		// hits every time somebody else walks up.
		await alice.getByTestId('show-code').click();
		await expect(status).toHaveAttribute('data-wake-lock', 'true');

		// The attribute is what this screen *decided*. Whether the browser grants
		// it is the platform's answer — headless Chromium exposes the API and
		// refuses every request, having no screen — and that half is pinned in
		// wake-lock.spec.js against a stubbed browser.
	});

	test('says what the background did to the connection', async ({ alice, bob }) => {
		// A browser closes an RTCPeerConnection when it suspends the page and fires
		// nothing doing it (w3c/webrtc-pc#2489). Switching to a messenger to paste
		// an invitation is exactly that — so the most common way to share one is
		// also the way to kill it, and until now the screen said nothing at all.
		//
		// Nobody can watch a display that is in the background, so the two readings
		// are taken for them and only the difference is shown.
		test.setTimeout(420_000);

		await connectViaPaste(alice, bob);

		// Playwright cannot background a page, and CDP does not help: this Chromium
		// has no `Emulation.setPageVisibilityOverride`, and `Page.setWebLifecycleState`
		// freezes without dispatching `visibilitychange`. Both were tried.
		//
		// So what is faked is the browser's *report* — `visibilityState` — and the
		// event is dispatched for real. The handler then runs its own logic
		// unmodified, which is the half worth testing. What this cannot show is the
		// part that made the feature necessary: a real phone also closes the peer
		// connection while away, and no emulation does that.
		const setVisibility = (/** @type {string} */ value) =>
			alice.evaluate((state) => {
				Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
				document.dispatchEvent(new Event('visibilitychange'));
			}, value);

		await setVisibility('hidden');
		await setVisibility('visible');

		// The connection survived here — loopback WebRTC does not die the way a
		// phone's does, which m3-booking already records. So the assertion is that
		// the app *reports on the spell*, not that it invents a failure: the quiet
		// verdict is the honest one for a connection that is still up.
		await expect(alice.getByTestId('away-report')).toHaveAttribute('data-verdict', 'kept', {
			timeout: 30_000
		});
	});

	test('warns before sending somebody away, not after', async ({ alice }) => {
		// At the button that causes it. A warning on the way back is a post-mortem,
		// and by then the invitation is already gone.
		await openConnect(alice, 'alice');

		await expect(alice.getByTestId('share-keep-open')).toBeVisible({ timeout: 90_000 });
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

		// A verdict means `probe()` actually ran. Rows render at build time whether
		// or not anything was measured, so asserting only the labels passes on a
		// panel that has never asked the network anything - which is exactly what
		// this page did until the probe moved into an effect that waits for the
		// element to exist.
		await expect(panel.locator('.line .verdict').first()).not.toHaveText('');
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
