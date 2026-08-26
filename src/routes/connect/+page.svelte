<script>
	/**
	 * Connection assistant — the only way two devices ever meet.
	 *
	 * The invitation is already there when the screen opens. That is the whole
	 * design: at a counter with somebody waiting, every tap is friction, and
	 * "create an invitation" is a step that means nothing to the person doing it.
	 * They do not want to create anything, they want to connect.
	 *
	 * One payload, three carriers, in the order they are actually reached for:
	 *
	 *   1. QR      — the other device is here. Hold it up, done.
	 *   2. Link    — the other device is elsewhere. Share sheet, messenger.
	 *   3. Paste   — no camera, no share sheet. Hidden under "advanced".
	 *
	 * The link and the QR are the *same invitation*, not two options: the QR
	 * encodes the link. Presenting them as a choice was the thing to avoid.
	 *
	 * What a link cannot remove is the second leg. WebRTC needs an answer, so the
	 * device that opens an invitation produces a reply that has to travel back —
	 * and this screen then shows that reply exactly the way it showed the
	 * invitation. Nobody has to know which string is which; opening a link is the
	 * entire interaction on the receiving side.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import Modal from '$lib/components/Modal.svelte';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import {
		connectedPeersStore,
		disconnectPeer,
		hangUp,
		peerIdStore,
		peerStatesStore,
		signallingStore
	} from '$lib/p2p/node.js';
	import { sharePayload } from '$lib/p2p/qr.js';
	import { buildLink, readLink } from '$lib/p2p/invite.js';
	import { iceMode, rtcConfiguration } from '$lib/p2p/libp2p-config.js';
	import { setShortCodeEnabled, shortCodeEnabled } from '$lib/p2p/short-code.js';
	import {
		isUsableRelayAddress,
		relayAddress,
		relayEnabled,
		setRelayAddress,
		setRelayEnabled
	} from '$lib/p2p/relay.js';
	import { syncWakeLock } from '$lib/p2p/wake-lock.js';
	import { createHandoff } from '$lib/p2p/handoff.js';
	import { canEditProgram, introduceToPeer, joinStore, joinStudioFromPeer } from '$lib/db/join.js';
	import { studioStore } from '$lib/db/registry.js';
	import * as m from '$lib/paraglide/messages.js';

	/**
	 * An offer carries ICE candidates, and those go stale — a network changes, a
	 * laptop moves between access points. A QR that is instantly visible but dead
	 * is worse than a button, so the invitation renews itself.
	 *
	 * Generous on purpose: every renewal invalidates the link already shared, so
	 * refreshing eagerly would break the very hand-off it is meant to protect.
	 */
	const INVITE_FRESH_MS = 4 * 60 * 1000;

	/**
	 * @type {'preparing' | 'inviting' | 'replying' | 'connecting' | 'connected'
	 *   | 'handed-over' | 'failed'}
	 */
	let step = $state('preparing');
	let payload = $state('');

	// Between taking a spent code off screen and having its replacement. Tracked
	// rather than inferred from an empty payload, because the card has to stay
	// where it is meanwhile: the renewal timer fires every four minutes while
	// somebody is standing there waiting to be scanned, and a card that vanishes
	// and comes back reads as something having gone wrong.
	let renewing = $state(false);
	/** What the QR encodes and the share sheet sends — the payload wrapped in a URL. */
	let link = $state('');
	let qrError = $state('');
	let inbound = $state('');
	let failure = $state('');
	let copied = $state(false);
	let scanning = $state(false);
	let fromLink = $state(false);

	/**
	 * Whether this device hands out short codes — see p2p/short-code.js for what
	 * that buys and what it costs.
	 *
	 * Starts false rather than reading the setting here: this route is prerendered,
	 * so the initial value is computed in node where there is no storage. `onMount`
	 * corrects it, which is also the only place it can be read honestly.
	 */
	let shortCode = $state(false);
	let relay = $state(false);
	/** The "why does this fail" dialog, opened from the code card. */
	let reachOpen = $state(false);

	let relayAddressDraft = $state('');
	let relayAddressBad = $state(false);

	/**
	 * Whether this device's code is off screen because it has been used.
	 *
	 * Not derived from `step`: `step` is already 'connected' when a second device
	 * pairs, so a rule written on it would hide the first code and then leave the
	 * next one up for good. What actually means "this code did its job" is the
	 * number of connected devices going up, which is true every time.
	 */
	let codeHidden = $state(false);

	/** Whether a code from another device was read, and read successfully. */
	let scanAccepted = $state(false);

	/**
	 * What this browser found out about reaching anyone off this network.
	 *
	 * `null` until the probe has run, and `null` again if it cannot decide. Note
	 * what it is *not*: a verdict on the network. The same phone on the same
	 * Wi-Fi reports differently in two browsers, because whether a reflexive
	 * candidate appears depends on the browser's WebRTC IP policy as much as on
	 * the route (libp2p-webrtc-qr AGENTS.md §2). So it is worded as something
	 * this device found, and it disables nothing.
	 *
	 * @type {'blocked' | 'unreliable' | null}
	 */
	let networkRisk = $state(null);

	/**
	 * `offNetworkRisk`, once the elements module has loaded.
	 *
	 * Held rather than imported at the top: that barrel defines custom elements
	 * on import, and this route is prerendered — a static import would run it in
	 * node, where `HTMLElement` does not exist.
	 *
	 * @type {((result: any) => 'blocked' | 'unreliable' | null) | null}
	 */
	let readRisk = $state(null);

	/**
	 * Deliberately not `$state`: it is the effect's own memory of what it last
	 * saw, and making it reactive would have the effect retrigger itself.
	 */
	let seenPeerCount = 0;

	$effect(() => {
		const count = $connectedPeersStore.length;

		if (count > seenPeerCount) codeHidden = true;
		seenPeerCount = count;
	});

	function showCodeAgain() {
		codeHidden = false;
		scanAccepted = false;
	}

	/**
	 * Whether the screen has something on it that somebody is trying to read.
	 *
	 * A phone lying on the counter with an invitation showing goes dark in fifteen
	 * seconds, while the other person is still getting their own phone out — and a
	 * scanner that dims mid-aim loses the frame it was about to catch. Neither is a
	 * connection fault; the screen simply left.
	 *
	 * Both sides of the same moment, so both count: the code being displayed and
	 * the camera being open.
	 */
	// A list rather than `step !== 'handed-over'`: at this point in the file
	// TypeScript has narrowed `step` to its initial value, so comparing it to any
	// other member reads as a comparison that can never be true. `includes` on a
	// plain array asks the same question without the narrowing.
	const STEPS_WITHOUT_A_CODE = ['handed-over'];

	let screenInUse = $derived(
		scanning || (Boolean(payload) && !codeHidden && !STEPS_WITHOUT_A_CODE.includes(step))
	);

	$effect(() => {
		syncWakeLock(screenInUse);
	});

	/**
	 * What the connection looked like on the way out, and on the way back.
	 *
	 * A browser closes an RTCPeerConnection when it suspends the page, and fires
	 * nothing at all doing it (w3c/webrtc-pc#2489) — measured upstream at a couple
	 * of seconds on Android. Switching to a messenger to paste an invitation is
	 * exactly that, so the most common way to share one is also the way to kill it.
	 *
	 * Nobody can watch a screen that is in the background, which is why this is a
	 * record rather than a warning: the two readings are taken automatically and
	 * the difference between them is the whole story. It cannot repair anything —
	 * once the browser has closed the connection it is gone — it can only stop the
	 * failure being invisible.
	 *
	 * Cast at the initialiser rather than annotated above it: with a bare `null`
	 * start, TypeScript narrows the variable to `never` at every later read, and
	 * the derived below cannot see the fields at all.
	 *
	 * @type {{ hadPeers: number, back: { hasPeers: number } | null } | null}
	 */
	let awaySpell = $state(
		/** @type {{ hadPeers: number, back: { hasPeers: number } | null } | null} */ (null)
	);

	onMount(() => {
		const onVisibilityChange = () => {
			// A browser drops the wake lock whenever the page stops being visible and
			// does not hand it back. Without this the screen stays awake exactly
			// until somebody glances at another app — the moment they are most likely
			// to come back to a counter and find it dark.
			syncWakeLock(screenInUse);

			if (document.visibilityState === 'hidden') {
				awaySpell = { hadPeers: $connectedPeersStore.length, back: null };
				return;
			}

			// Only if there is a departure to compare against: becoming visible
			// without having gone away is a normal event on load in some browsers,
			// and reporting on it would be reporting on nothing.
			if (awaySpell) awaySpell = { ...awaySpell, back: { hasPeers: $connectedPeersStore.length } };
		};

		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => document.removeEventListener('visibilitychange', onVisibilityChange);
	});

	/**
	 * Said only when the two readings differ for the worse.
	 *
	 * A spell in the background that cost nothing is worth a quiet line rather than
	 * silence — somebody who was warned before leaving should be told the warning
	 * did not come true. A spell that cost the connection gets the loud one.
	 */
	let awayVerdict = $derived(
		!awaySpell?.back
			? null
			: awaySpell.hadPeers > 0 && awaySpell.back.hasPeers === 0
				? 'lost'
				: awaySpell.hadPeers > 0
					? 'kept'
					: null
	);

	onDestroy(() => {
		// Leaving this screen means nothing here needs reading any more. A lock left
		// behind would hold a studio's tablet awake for the rest of the day.
		syncWakeLock(false);
	});

	/** @type {HTMLVideoElement | undefined} */
	// Typed loosely on purpose: svelte-check has no element interface for
	// <qr-scanner> and falls back to HTMLVideoElement, which has neither open()
	// nor close().
	/** @type {any} */
	let scanner = $state(null);
	let status = $state();
	/** @type {any} */
	let peerList = $state(null);
	let elementsReady = $state(false);

	/**
	 * Apply everything that has to be set *on* an element, once there is one.
	 *
	 * Both conditions matter and neither is enough alone. Before the module is
	 * imported the tags are unknown elements, and assigning `strings` to one
	 * writes an own property that shadows the setter for good once it upgrades -
	 * silently, with the defaults still on screen. Before StudioGate opens the
	 * elements are not in the document at all.
	 *
	 * This used to run in the import callback, which met the first condition and
	 * missed the second: the labels stayed English *and* `probe()` never ran, so
	 * the readiness panel showed rows that had never been measured.
	 */
	$effect(() => {
		if (!elementsReady || !status) return;

		translateElements();

		// The verdict, taken from the probe the panel already runs rather than by
		// measuring a second time: `probe` carries the result, and asking the
		// network twice to answer one question would double the STUN round trips
		// somebody is waiting through.
		const onProbe = (/** @type {any} */ event) => {
			networkRisk = readRisk?.(event.detail) ?? null;
		};

		status.addEventListener('probe', onProbe);

		// The same servers the handshake will use, so the reading is about this
		// configuration rather than about a default somebody else picked.
		status.rtcConfiguration = rtcConfiguration();
		status.probe().catch(() => {});

		return () => status.removeEventListener('probe', onProbe);
	});

	/**
	 * Hand the elements this app's language.
	 *
	 * They ship English defaults, which is fine for the package's own demo and
	 * wrong inside a German screen. `strings` merges over those defaults, so a
	 * line added upstream later keeps its English rather than going blank here.
	 *
	 * Assigned once rather than in an effect: paraglide's `setLocale` reloads the
	 * page (runtime.js calls `window.location.reload()`), so there is no locale
	 * change to react to within one page life. If that ever stops being true,
	 * this needs to become an effect and the tests below will not notice - so it
	 * is written down rather than left to be rediscovered.
	 *
	 * `label` stays an attribute: it is the dialog title, it is already there and
	 * tested, and one string with two sources is how the two drift apart.
	 */
	function translateElements() {
		if (status) {
			status.strings = {
				browser: m.qr_status_browser(),
				ipv4: m.qr_status_ipv4(),
				ipv6: m.qr_status_ipv6(),
				camera: m.qr_status_camera(),
				overall: m.qr_status_overall(),
				open: m.qr_status_open(),
				relay: m.qr_status_relay(),
				symmetric: m.qr_status_symmetric(),
				blocked: m.qr_status_blocked(),
				measuring: m.qr_status_measuring(),
				// The two alarms deliberately do not say "or use a relay", which the
				// package's English defaults do. This application has no relay and is
				// never getting one (CLAUDE.md), so that sentence would be advice it
				// cannot honour — the worst kind on a screen somebody is stuck on.
				alarm: m.qr_status_alarm(),
				alarmUnreliable: m.qr_status_alarm_unreliable()
			};
		}

		if (scanner) {
			scanner.strings = {
				close: m.qr_scanner_close(),
				unsupported: m.qr_scanner_unsupported(),
				starting: m.qr_scanner_starting(),
				looking: m.qr_scanner_looking(),
				// Functions, not templates: these carry numbers, and the package
				// deliberately does not fix our word order onto every consumer.
				stillLooking: (/** @type {{ attempts: number }} */ { attempts }) =>
					m.qr_scanner_still_looking({ attempts }),
				rejected: m.qr_scanner_rejected(),
				animated: (/** @type {{ received: number, total: number }} */ { received, total }) =>
					m.qr_scanner_animated({ received, total }),
				animatedUnknown: m.qr_scanner_animated_unknown()
			};
		}
	}

	/**
	 * Who is connected, and how that connection is doing.
	 *
	 * The membership comes from libp2p, because that is what decides whether this
	 * device can exchange anything with that one. The health comes from WebRTC
	 * underneath it, and falls back to `connected` rather than to nothing: an
	 * inbound peer whose handshake this page never saw is genuinely connected, and
	 * a row reading "connecting…" forever would be a lie about a working device.
	 */
	let devices = $derived(
		$connectedPeersStore.map((peerId) => ({
			peerId,
			state: $peerStatesStore[peerId] ?? 'connected'
		}))
	);

	/**
	 * A property, not an attribute: `peers` is an array, and `<qr-peers>` is only
	 * defined once the dynamic import above has resolved. Assigning through
	 * `bind:this` is what the rest of this screen does with the elements for the
	 * same reason.
	 */
	$effect(() => {
		if (peerList) peerList.peers = devices;
	});

	/**
	 * The peer list gets its own effect, because it is not in the document when
	 * the one above runs.
	 *
	 * `<qr-peers>` only renders once somebody is connected, which is minutes after
	 * the screen mounted. Translating it up there would set `strings` on nothing —
	 * the same mistake that once left the readiness panel English *and* unprobed.
	 * Reading `peerList` here is what makes this re-run when the element appears.
	 */
	$effect(() => {
		if (!elementsReady || !peerList) return;

		peerList.strings = {
			connected: m.qr_peers_connected(),
			connecting: m.qr_peers_connecting(),
			new: m.qr_peers_connecting(),
			disconnected: m.qr_peers_disconnected(),
			failed: m.qr_peers_failed(),
			closed: m.qr_peers_closed(),
			disconnect: m.qr_peers_disconnect(),
			// A function, not a template: the package does not fix our word order
			// onto every consumer, and this one carries a value.
			disconnectFrom: (/** @type {{ peerId: string }} */ { peerId }) =>
				m.qr_peers_disconnect_from({ peerId })
		};
	});

	// STUN turned off is a setting somebody chose, not a fault to report - #26 is
	// explicit that reporting a choice as a failure is worse than saying nothing.
	// So the two address families and the summary they feed drop out in that mode.
	//
	// What does not drop out is the browser and the camera. A browser that cannot
	// do WebRTC and a camera nobody granted break the check-in desk just as badly
	// with STUN off as with it on, and hiding the whole panel there - which is
	// what this page did - hid the two rows that were still true.
	const stunConfigured = typeof window !== 'undefined' && iceMode() !== 'host';

	/**
	 * Whether to advise against sending this invitation away.
	 *
	 * Gated on `stunConfigured` for the same reason the address rows are: with
	 * `?ice=host` there is no STUN, so nothing reflexive is gathered and the probe
	 * says `blocked` — truthfully, and about a setting somebody chose. Painting a
	 * decision as a fault is worse than saying nothing (#26), and without this the
	 * whole e2e suite would run under a red banner.
	 *
	 * @type {'blocked' | 'unreliable' | null}
	 */
	let shareRisk = $derived(stunConfigured ? networkRisk : null);
	const statusRows = stunConfigured ? 'browser ipv4 ipv6 camera overall' : 'browser camera';
	/** @type {HTMLCanvasElement | undefined} */
	/** @type {AbortController | null} */
	/** @type {ReturnType<typeof setInterval> | null} */
	let refreshTimer = null;
	let unsubscribeSignalling = () => {};
	/** @type {ReturnType<typeof createHandoff> | null} */
	let handoff = null;

	onMount(() => {
		shortCode = shortCodeEnabled();
		relay = relayEnabled();
		relayAddressDraft = relayAddress();

		// Loaded in the browser only: this page renders on the server first, where
		// `customElements` does not exist.
		// Loaded here, applied in the effect below. The elements live behind
		// StudioGate, so at this point they are not in the document yet - `status`
		// and `scanner` are still undefined, and anything set on them now would be
		// set on nothing.
		import('@le-space/libp2p-webrtc-qr/elements').then((elements) => {
			readRisk = elements.offNetworkRisk;
			elementsReady = true;
		});

		// A reply that arrives through a messenger opens a new tab, and the offer
		// it answers lives in this one. Take it if it is ours.
		handoff = createHandoff();
		handoff.onReply(async (text) => {
			if (step !== 'inviting') return false;

			// Answer the *ownership* question and nothing else. `{ dial: false }`
			// stops after the signature check and the session match - local work,
			// milliseconds - so the claim goes out well inside the other tab's
			// window. Connecting from here first would miss it: since the dial moved
			// into acceptAnswer, finishing the handshake takes seconds, and the tab
			// holding the reply would already have told the user nobody wanted it
			// while this tab connected anyway.
			/** @type {string} */
			let remotePeerId;

			try {
				remotePeerId = await $signallingStore.acceptAnswer(text, { dial: false });
			} catch {
				// Not our offer. Staying silent is the point: claiming it would tell
				// the other tab to close over a handshake nobody completed.
				return false;
			}

			// Ours. The rest runs after the claim, not before it - the reply cannot
			// go anywhere else now, and a failure here is this tab's to show.
			void (async () => {
				try {
					await $signallingStore.connect(remotePeerId);
					await makeInvitation({ announce: false });
					step = 'connected';
					await greetAndMaybeJoin(remotePeerId);
				} catch (/** @type {any} */ error) {
					failure = error?.message ?? String(error);
					step = 'failed';
				}
			})();

			return true;
		});

		// The node is started by StudioGate and arrives asynchronously, so wait for
		// it rather than racing it. Once it is here, either answer the invitation
		// that brought us to this URL, or put our own on screen.
		unsubscribeSignalling = signallingStore.subscribe((signalling) => {
			if (!signalling || step !== 'preparing') return;
			void begin();
		});

		// Only while somebody is looking. A screen left open in a drawer has no
		// reason to keep building peer connections.
		refreshTimer = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			if (step !== 'inviting' && step !== 'connected') return;
			void refreshInvite();
		}, INVITE_FRESH_MS);
	});

	onDestroy(() => {
		// The element releases the camera when it leaves the document, so this only
		// has to close the dialog if the page is left with it open.
		scanner?.close();
		unsubscribeSignalling();
		handoff?.close();
		if (refreshTimer) clearInterval(refreshTimer);
	});

	/** Answer an invitation we were opened with, or offer one of our own. */
	async function begin() {
		const incoming = readLink(location.hash);

		if (incoming) {
			// Take it out of the address bar immediately: a reload must not replay a
			// handshake, and a payload has no business sitting in a shared screen or
			// in the browser history.
			history.replaceState(null, '', location.pathname + location.search);
			fromLink = true;

			// A reply answers an offer, and an offer is an RTCPeerConnection living
			// in the tab that made it. Clicking a link in a messenger opens a *new*
			// tab, so the tab that can finish this is usually another one — offer it
			// there first, and only handle it here if nobody takes it.
			if (incoming.kind === 'reply' && (await handoff?.offerReply(incoming.payload))) {
				step = 'handed-over';
				return;
			}

			await handleInbound(incoming.payload);
			return;
		}

		await refreshInvite();
	}

	/**
	 * Ask the other device which studio it belongs to, and open it here.
	 *
	 * Only for a device that has not set up a studio of its own — a studio
	 * owner connecting to a student must not be pulled into the student's empty
	 * one. An unnamed studio is the marker for "this device has never been set
	 * up", which is exactly the case a student device is in.
	 */
	async function greetAndMaybeJoin(/** @type {string} */ remotePeerId) {
		// Always introduce: a counter cannot sell to, or check in, a device whose
		// DID and ledger address it was never told — and that is true whether or
		// not this device already belongs to a studio.
		await introduceToPeer(remotePeerId);

		// Joining is the other half, and the question is not "does this device
		// already have a studio" but "does it *run* one".
		//
		// It used to be the former, and that refused the ordinary case: a student
		// who goes to two studios could pair with the second but never joined it,
		// because the first had filled `studioStore`. What the guard is actually
		// for is the opposite direction — an owner or a front desk connecting to a
		// student must not be pulled into that student's empty studio — and
		// `canEditProgram()` answers that from the registry — but only together
		// with a named studio, and each half alone is wrong. `canEditProgram()`
		// says yes on a device with no studio at all, because `isOwnStudio()`
		// treats an unnamed studio as this device's own; that is right just after
		// somebody creates one and useless as a test for "is set up". And a name on
		// its own was the old guard, which is precisely what locked the student
		// out. #68.
		if ($studioStore?.name && canEditProgram()) return;

		try {
			await joinStudioFromPeer(remotePeerId);
		} catch {
			// Surfaced through joinStore; the connection itself stays usable.
		}
	}

	/**
	 * Put a payload on screen as a link, a QR code and copyable text.
	 *
	 * @param {string} text
	 * @param {'invite' | 'reply'} kind
	 */
	async function showPayload(text, kind) {
		payload = text;
		link = buildLink({ payload: text, kind, origin: location.origin, base });
		qrError = '';

		// No budget check any more: <qr-invite> splits a link that will not fit
		// one code into an animated sequence rather than refusing it. The 2200
		// character limit this used to enforce was a documented limitation
		// (docs/LIMITS.md §1.6) and is now simply not one.
	}

	/**
	 * Put a fresh invitation on screen.
	 *
	 * @param {object} [options]
	 * @param {boolean} [options.announce] move to 'inviting'; false keeps the
	 *   current step, which is how a just-made connection stays reported while
	 *   the screen is already armed for the next one.
	 */
	async function makeInvitation({ announce = true } = {}) {
		// Close the previous unanswered offer first, or every renewal would
		// strand a peer connection for the lifetime of the page.
		$signallingStore.discardUnusedOffers();

		// And take the old code off screen before building the new one, because
		// creating an offer waits for ICE gathering — a second here, longer on a
		// busy machine — and until this line existed the *previous* code stayed up
		// for all of it.
		//
		// A renewal follows every connection, so that window falls exactly where a
		// queue at the counter is: the device that just connected has moved aside
		// and the next person is already pointing a camera at the screen. What they
		// scan then is the invitation the previous device answered, and answering it
		// a second time is a dead end no error can describe — that offer's peer
		// connection is alive and its ICE credentials still check out, so the
		// candidate pair comes up, but its DTLS handshake finished with the other
		// device and no second one begins. The scanner sits at "connecting" until it
		// gives up. Diagnosed from CI in #80.
		renewing = true;
		clearPayload();

		try {
			await showPayload(await $signallingStore.createOffer(), 'invite');
		} finally {
			renewing = false;
		}

		if (announce) step = 'inviting';
	}

	/** Nothing to scan is better than something spent. */
	function clearPayload() {
		payload = '';
		link = '';
	}

	async function refreshInvite() {
		failure = '';
		scanAccepted = false;
		try {
			await makeInvitation();
		} catch (/** @type {any} */ error) {
			failure = error?.message ?? String(error);
			step = 'failed';
		}
	}

	/**
	 * Turn the relay on or off for the next start.
	 *
	 * Deliberately without restarting the node here. Tearing the stack down to
	 * apply a checkbox would drop every connection this screen exists to make,
	 * and somebody ticking it mid-handshake would lose the handshake. The hint
	 * says when it takes effect instead of the box lying about it (#94).
	 *
	 * @param {boolean} enabled
	 */
	function chooseRelay(enabled) {
		relay = enabled;
		setRelayEnabled(enabled);
	}

	/**
	 * Keep, or clear, the address of a relay somebody runs themselves.
	 *
	 * Empty is a valid answer and means "use the one shipped with the app", so it
	 * is stored as such rather than rejected. Anything else has to be usable
	 * before it is kept: an address without a peer id is one nobody can be sure
	 * they reached, and a relay is exactly the machine to be sure about. Saying so
	 * while the field is still in front of somebody beats a node that fails to
	 * start on the next load with nothing to point at.
	 *
	 * @param {string} value
	 */
	function chooseRelayAddress(value) {
		relayAddressDraft = value;

		if (!value.trim()) {
			relayAddressBad = false;
			setRelayAddress('');
			return;
		}

		relayAddressBad = !isUsableRelayAddress(value);
		if (!relayAddressBad) setRelayAddress(value);
	}

	/**
	 * Turn short codes on or off, and put the choice on screen immediately.
	 *
	 * Rebuilding the invitation is the point rather than a nicety: without it the
	 * box says one thing while the code beside it is still the other format, and
	 * the only way to find out which one you are showing is to have somebody scan
	 * it. The invitation being rebuilt does invalidate a link already shared — the
	 * same cost `connect_refresh` has always had, and paid here knowingly because a
	 * studio that just changed the format has not handed anything out yet.
	 *
	 * Not while a reply is on screen: an answer is in whatever format its offer
	 * arrived in, so there is nothing to switch, and rebuilding would throw away a
	 * reply the other device is waiting for.
	 *
	 * @param {boolean} enabled
	 */
	async function chooseShortCode(enabled) {
		shortCode = enabled;
		setShortCodeEnabled(enabled);

		if (step === 'inviting') await refreshInvite();
	}

	/** Handle a payload that arrived by link, scan or paste — same code path. */
	async function handleInbound(/** @type {string} */ text) {
		const trimmed = text.trim();
		if (!trimmed) return;

		failure = '';
		try {
			const kind = await $signallingStore.classify(trimmed);

			if (kind === 'offer') {
				const { answer, remotePeerId, connected } = await $signallingStore.acceptOffer(trimmed);
				// Only now: `acceptOffer` verifies the signature, so anything short of
				// this is "a code was seen", not "a code was read".
				scanAccepted = true;
				// Show the reply straight away: it is what the other device is
				// waiting for, and it is ready long before the link comes up.
				await showPayload(answer, 'reply');
				step = 'replying';
				connected
					.then(async () => {
						// The reply has done its job. Arm the screen for the next person
						// before saying "connected", so the two are never out of step.
						await makeInvitation({ announce: false });
						step = 'connected';
						await greetAndMaybeJoin(remotePeerId);
					})
					.catch((/** @type {any} */ error) => {
						failure = error?.message ?? String(error);
						step = 'failed';
					});
				return;
			}

			// The inviting side reads a code too — the reply. Same acknowledgement,
			// because the person holding this device has the same doubt about the
			// camera, and `acceptAnswer` below is the slow half.
			scanAccepted = true;
			step = 'connecting';
			const remotePeerId = await $signallingStore.acceptAnswer(trimmed);

			// An invitation can only be used once, and this one just was. Without
			// this the front desk would keep showing a spent code to the next
			// student — the screen is only remounted by a full page load, so
			// walking back to it does not refresh anything.
			await makeInvitation({ announce: false });

			step = 'connected';
			await greetAndMaybeJoin(remotePeerId);
		} catch (/** @type {any} */ error) {
			// The one failure a person can actually act on: a reply whose invitation
			// was made somewhere else. Say what to do instead of quoting the
			// internals at them.
			failure =
				fromLink && /different connection attempt/i.test(error?.message ?? '')
					? m.connect_reply_orphan()
					: (error?.message ?? String(error));
			step = 'failed';
		}
	}

	function scan() {
		failure = '';
		scanning = true;

		// The element owns the camera and the decode loop, including the frame by
		// frame reassembly of an animated code - which is what lets this screen
		// stop enforcing a character budget on the other side of the exchange.
		scanner?.open().catch((/** @type {any} */ error) => {
			scanning = false;
			failure = error?.message ?? String(error);
			step = 'failed';
		});
	}

	/** @param {string} text */
	async function onScanned(text) {
		scanning = false;

		try {
			// A scanned code now holds a link, but a code from an older version
			// holds the bare payload — accept both rather than reject a device
			// that has not updated yet.
			await handleInbound(readLink(new URL(text, location.origin).hash)?.payload ?? text);
		} catch (/** @type {any} */ error) {
			failure = error?.message ?? String(error);
			step = 'failed';
		}
	}

	async function copy() {
		await navigator.clipboard.writeText(payload);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function share() {
		try {
			await sharePayload({ title: m.connect_title(), text: link });
		} catch (/** @type {any} */ error) {
			if (error?.name !== 'AbortError') failure = error?.message ?? String(error);
		}
	}
</script>

<h1 class="text-3xl font-bold">{m.connect_title()}</h1>
<p class="mt-2 max-w-xl text-muted">{m.connect_intro()}</p>

<!--
	Gated like the studio screens, and for the same reason: a connection is only
	worth anything once this device has an identity other devices can grant
	something to.
-->
<StudioGate>
	{#if $connectedPeersStore.length > 0}
		<button
			type="button"
			data-testid="hang-up"
			onclick={() => hangUp()}
			class="mt-4 rounded-control border border-border px-3 py-1 text-sm"
		>
			{m.connect_hang_up()}
		</button>
	{/if}

	<!--
		`data-wake-lock` reports what this screen *decided*, not what the browser
		granted. Two reasons, and both matter. A headless browser exposes the API
		and then refuses every request, having no screen to keep awake, so a test
		on the granted lock would be testing the platform. And `wakeLockState()` is
		a plain function call, which Svelte does not track — reading it here would
		render once and then never change.

		That the module honours the decision is the unit tests' job, where the
		browser can be stubbed into answering.
	-->
	<p
		class="mt-2 text-sm"
		data-testid="connection-status"
		data-step={step}
		data-wake-lock={screenInUse}
	>
		{#if step === 'connected'}
			<!-- A count, not the first peer id. With three devices connected, naming
			     one of them and staying silent about the others was the bug: the
			     screen said "connected to …" and looked the same whether one device
			     or four were on the other end. The ids are in the list below. -->
			<span class="text-success">
				{m.sync_peers({ count: $connectedPeersStore.length })}
			</span>
		{:else if step === 'failed'}
			<span class="text-danger">{m.connect_status_failed({ reason: failure })}</span>
		{:else if step === 'connecting'}
			<span class="text-muted">{m.connect_status_connecting()}</span>
		{:else if step === 'handed-over'}
			<span class="text-success">{m.connect_handed_over_title()}</span>
		{:else if fromLink && step === 'preparing'}
			<span class="text-muted">{m.connect_from_link()}</span>
		{:else if step === 'preparing'}
			<span class="text-muted">{m.connect_preparing()}</span>
		{:else}
			<span class="text-muted">{m.connect_waiting_other()}</span>
		{/if}
	</p>

	<!--
		The read itself, acknowledged.

		Scanning used to be silent about the one thing the person doing it is
		unsure of: whether the camera actually got it. The screen changed — a new
		code appeared where the old one was — but nothing said that change was
		caused by a successful read rather than by the invitation renewing itself.
		Gone once connected, where the connection is the better news.
	-->
	<!--
		What happened while nobody could look. The two readings are taken by the
		visibility handler; this is only the difference between them, and it says
		whose doing it was — a person who comes back to a dead connection otherwise
		blames the other device, or the app, or the code they just held up.
	-->
	{#if awayVerdict}
		<p
			class="mt-2 text-sm {awayVerdict === 'lost' ? 'text-warning' : 'text-muted'}"
			data-testid="away-report"
			data-verdict={awayVerdict}
		>
			{awayVerdict === 'lost' ? m.connect_away_lost() : m.connect_away_kept()}
		</p>
	{/if}

	{#if scanAccepted && (step === 'replying' || step === 'connecting')}
		<p class="mt-2 text-sm text-success" data-testid="scan-accepted">
			{m.connect_scan_accepted()}
		</p>
	{/if}

	{#if $joinStore.state !== 'idle'}
		<!--
			`data-live` alongside `data-state`, because they are the two facts this
			line carries and the old tests could only see one. Both sentences name the
			studio, so an assertion on the text passed either way — which is how a
			green "Programm wird repliziert" survived on a device with no connection.
		-->
		<p
			class="mt-1 text-sm"
			data-testid="join-status"
			data-state={$joinStore.state}
			data-live={$connectedPeersStore.length > 0}
		>
			{#if $joinStore.state === 'joined'}
				<!--
					Two different sentences, because "joined" and "connected" are two
					different facts and this line used to conflate them.

					`joinStore` never returns to idle, and it should not: belonging to a
					studio is a membership, and it survives a connection the way it
					survives a reload. What does not survive is the replication, and the
					old wording claimed it in the present tense — so a phone whose
					connection had died three minutes earlier read "Programm wird
					repliziert" in green while the bar above it correctly said nobody was
					connected. Reported from a real device, and the contradiction is the
					bug rather than either half.

					Liveness comes from the peer count, which is where it lives for the
					whole app, rather than from a second copy that can go stale.
				-->
				<!--
					And the colour with it. Green is a claim of its own: it says "this is
					working right now", which is exactly what a stale line must not say.
					A membership with nobody connected is neither good news nor bad — it
					is a fact, and it gets the muted tone the rest of the app uses for
					facts.
				-->
				<span class={$connectedPeersStore.length > 0 ? 'text-success' : 'text-muted'}>
					{$connectedPeersStore.length > 0
						? m.join_success({ studio: $joinStore.studioName ?? '' })
						: m.join_membership({ studio: $joinStore.studioName ?? '' })}
				</span>
			{:else if $joinStore.state === 'error'}
				<span class="text-danger">{m.join_failed({ reason: $joinStore.error ?? '' })}</span>
			{:else}
				<span class="text-muted">{m.join_busy()}</span>
			{/if}
		</p>
	{/if}

	<!--
		Who is on the other end — all of them.

		Until now this screen could connect a second, third and fourth device and
		show none of it: one line naming the first peer, and a front desk with a
		teacher and two students on it looked exactly like a front desk with one.
		The per-row disconnect is the reason it is a list rather than a count: a
		student leaving should not cost the two connections that are staying.
	-->
	{#if devices.length > 0}
		<section class="mt-4 max-w-md" data-testid="devices">
			<h2 class="text-sm font-medium">{m.connect_devices_title()}</h2>
			<qr-peers
				bind:this={peerList}
				data-testid="device-list"
				class="mt-2 block"
				style="--qr-peers-background: transparent; --qr-peers-border: currentColor; --qr-peers-accent: currentColor; --qr-peers-muted: currentColor;"
				ondisconnect={(/** @type {any} */ event) => disconnectPeer(event.detail.peerId)}
			></qr-peers>
		</section>
	{/if}

	{#if step === 'handed-over'}
		<section
			class="mt-6 max-w-md rounded-card border border-border bg-surface p-6"
			data-testid="handed-over"
		>
			<h2 class="text-lg font-medium">{m.connect_handed_over_title()}</h2>
			<p class="mt-1 text-sm text-muted">{m.connect_handed_over_hint()}</p>
		</section>
	{/if}

	<!-- What has to hold before anyone holds up a code. It reports the
	     preconditions, not the outcome - two devices behind symmetric NAT is
	     exactly the case STUN cannot solve, and no green light here promises
	     otherwise. Which rows appear depends on the ICE mode; see statusRows. -->
	<qr-status
		bind:this={status}
		rows={statusRows}
		data-testid="network-status"
		class="mt-6 block max-w-md"
		style="--qr-status-chip-background: transparent; --qr-status-chip-color: inherit; --qr-status-verdict-color: inherit;"
	></qr-status>

	<!--
		The relay lives here, directly under the network verdict, and no longer at
		the bottom of "advanced".

		It was three screens down, below a payload format nobody at a counter has
		an opinion about. That is the wrong place for the one remedy this screen
		offers: the row above may have just said this device reaches nobody from
		this network, and the answer to that should be within reach of the
		sentence that raised it.

		Deliberately *not* hidden when the relay is on, and neither is anything
		about the code. Two reasons, both checked rather than assumed: the choice
		only takes effect on the next start, so hiding the code path would leave
		somebody who just ticked the box with no way to connect at all; and a
		relay does not replace the handshake — `greetAndMaybeJoin` runs only from a
		scanned or pasted payload, never for a peer discovery turned up, so a
		first pairing still needs the code (#94).
	-->
	<!--
		Off, and off means more than a default: without this the node has no
		bootstrap list, announces no `/p2p-circuit`, and refuses to dial anything
		that is not a QR session — checked in libp2p-config.spec.js rather than
		promised in prose (#94).

		The cost is in the hint rather than left to be discovered. A relay does
		not see what two devices exchange; it does see that they want each other
		and where they are. Whoever ticks this should know which of the two they
		are agreeing to.
	-->
	<label class="mt-4 flex items-start gap-3 text-sm">
		<input
			type="checkbox"
			data-testid="use-relay"
			checked={relay}
			onchange={(event) => chooseRelay(event.currentTarget.checked)}
			class="mt-1 shrink-0"
		/>
		<span>
			{m.connect_relay()}
			<span class="mt-1 block text-xs text-muted">{m.connect_relay_hint()}</span>
		</span>
	</label>

	{#if relay}
		<!--
			Only while the relay is on: an address field above a switch that is off
			is a question nobody was asked.
		-->
		<label class="mt-3 block text-sm">
			{m.connect_relay_address()}
			<input
				type="text"
				data-testid="relay-address"
				value={relayAddressDraft}
				oninput={(event) => chooseRelayAddress(event.currentTarget.value)}
				placeholder="/dns4/…/tcp/443/tls/ws/p2p/12D3KooW…"
				class="mt-1 w-full rounded-control border p-2 font-mono text-xs"
			/>
			<span class="mt-1 block text-xs text-muted">{m.connect_relay_address_hint()}</span>
			{#if relayAddressBad}
				<span class="mt-1 block text-xs text-danger" data-testid="relay-address-invalid">
					{m.connect_relay_address_invalid()}
				</span>
			{/if}
		</label>
	{/if}

	<!--
		A code that has done its job comes down.

		It used to stay: the screen re-armed itself with the next invitation the
		moment a connection came up, so a device that had just paired went on
		holding up a code nobody was waiting for. At a counter that reads as "it
		did not work" — the one thing on screen has not changed. Inviting the next
		person is one press away rather than automatic, which is also the honest
		order: most of the time there is no next person.
	-->
	{#if codeHidden && step === 'connected'}
		<button
			type="button"
			data-testid="show-code"
			onclick={showCodeAgain}
			class="mt-6 rounded-control border border-border px-4 py-2"
		>
			{m.connect_another()}
		</button>
	{/if}

	{#if (payload || renewing) && step !== 'handed-over' && !codeHidden}
		<section
			class="mt-6 max-w-md rounded-card border border-border bg-surface p-6"
			data-testid="code-card"
			data-kind={step === 'replying' ? 'reply' : 'invite'}
		>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<!--
						Named on the code itself, not only in the heading. The reply
						occupies the same card in the same place as the invitation, so
						without this the screen looks unchanged at the exact moment it
						changed meaning — and the other device is then shown a code
						nobody can tell apart from the one it just scanned.
					-->
					<p
						class="text-xs font-semibold tracking-wide uppercase {step === 'replying'
							? 'text-accent'
							: 'text-muted'}"
						data-testid="code-kind"
					>
						{step === 'replying' ? m.connect_kind_reply() : m.connect_kind_invite()}
					</p>
					<h2 class="mt-1 text-lg font-medium">
						{step === 'replying' ? m.connect_reply_title() : m.connect_ready_title()}
					</h2>
					<p class="mt-1 text-sm text-muted">
						{step === 'replying' ? m.connect_reply_hint() : m.connect_ready_hint()}
					</p>

					<!--
						What is marked, and what deliberately is not.

						The badge says "connecting from afar is experimental" rather than
						"QR codes are experimental", because those are different claims and
						only one of them is true. A code scanned across a counter needs no
						internet and does not fail; the same code carried to another network
						often does, and that is what somebody should be warned about before
						they rely on it.

						Colour plus a word, not colour alone — a badge that only turns amber
						says nothing to anybody who cannot see the difference.
					-->
					<p class="mt-2 flex flex-wrap items-center gap-2">
						<span
							class="rounded-control bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
							data-testid="reach-badge"
						>
							{m.connect_reach_badge()}
						</span>
						<button
							type="button"
							data-testid="reach-info"
							onclick={() => (reachOpen = true)}
							class="text-xs underline"
						>
							{m.connect_reach_info()}
						</button>
					</p>
				</div>
				<button
					type="button"
					data-testid="share-payload"
					onclick={share}
					disabled={renewing}
					class="shrink-0 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
				>
					{step === 'replying' ? m.connect_share_reply() : m.connect_share_invite()}
				</button>
			</div>

			<!--
				At the button that sends somebody away, not on their return: a warning
				after the fact is a post-mortem.

				It names the *action* rather than the browser. Upstream keeps a list of
				which browsers hold a suspended connection for how long, and that list
				is exactly the kind of claim that is wrong after the next release —
				AGENTS.md §2 says as much about browser-dependent behaviour. What is
				reliably true is that leaving costs the invitation.
			-->
			<p class="mt-3 max-w-md text-sm text-muted" data-testid="share-keep-open">
				{m.connect_share_keep_open()}
			</p>

			<!--
				Said at the button that is about to fail, not in the readiness panel
				further up where it reads as one row among five.

				Nothing is disabled, and that is the point rather than timidity: the
				normal case at a counter is two devices in the same room, and a network
				this verdict calls `blocked` still connects them over host candidates.
				Disabling the code would break what works to protect what rarely
				happens — and the verdict is about this browser anyway, not the network.
				So both sentences end by naming the way that does work: scan it here.
			-->
			{#if shareRisk}
				<p
					class="mt-3 text-sm {shareRisk === 'blocked' ? 'text-danger' : 'text-warning'}"
					data-testid="share-risk"
					data-risk={shareRisk}
				>
					{shareRisk === 'blocked'
						? m.connect_share_risk_blocked()
						: m.connect_share_risk_unreliable()}
				</p>
			{/if}

			{#if renewing}
				<!-- Deliberately not the old code dimmed or greyed: it would still be
				     scannable, and scanning it is the dead end this whole state exists
				     to prevent (#80). -->
				<p class="mt-4 text-sm text-muted" data-testid="qr-renewing">{m.connect_renewing()}</p>
			{:else if link}
				<!-- The QR field keeps a light ground in both themes; see tokens.css.
				     data-link is what the code encodes, so a test photographs the same
				     string a camera would read. -->
				<div class="qr-field mt-4 inline-block">
					<qr-invite
						value={link}
						data-testid="qr-image"
						data-link={link}
						style="--qr-invite-max-width: 280px; --qr-invite-caption-color: inherit;"
					></qr-invite>
				</div>
			{:else if qrError}
				<p class="mt-4 text-sm text-warning" data-testid="qr-too-large">{qrError}</p>
			{/if}
		</section>
	{/if}

	<div class="mt-6 flex flex-wrap gap-3">
		<button
			type="button"
			data-testid="scan-qr"
			disabled={!$signallingStore || scanning}
			onclick={scan}
			class="rounded-control border border-border px-4 py-2"
		>
			{m.connect_scan()}
		</button>
	</div>

	<!--
		Everything below is the fallback for a device with no camera and no share
		sheet. Closed by default: reintroducing "which of these strings do I use"
		as a visible choice is exactly what this screen exists to avoid.
	-->
	<details class="mt-6 max-w-md rounded-card border border-border bg-surface p-6">
		<summary class="cursor-pointer text-sm font-medium" data-testid="advanced-toggle">
			{m.connect_advanced()}
		</summary>

		<p class="mt-3 text-sm text-muted">{m.connect_advanced_hint()}</p>

		<p class="mt-3 font-mono text-xs break-all text-faint" data-testid="own-peer-id">
			{$peerIdStore ?? '…'}
		</p>

		<!--
			Behind "advanced" rather than beside the code, because a studio at a
			counter should not be asked to choose a payload format to connect two
			devices. Someone who has read why it exists will come looking here; nobody
			else has to meet it. The hint says what it costs in the same breath as
			what it buys - a box promising a faster scan without mentioning that every
			second connection went silent under load would be a trap.
		-->
		<label class="mt-4 flex items-start gap-3 text-sm">
			<input
				type="checkbox"
				data-testid="short-code"
				checked={shortCode}
				onchange={(event) => chooseShortCode(event.currentTarget.checked)}
				class="mt-1 shrink-0"
			/>
			<span>
				{m.connect_short_code()}
				<span class="mt-1 block text-xs text-muted">{m.connect_short_code_hint()}</span>
			</span>
		</label>

		{#if payload}
			<label class="mt-4 block text-sm text-muted" for="payload">{m.connect_copy()}</label>
			<textarea
				id="payload"
				data-testid="payload"
				readonly
				rows="4"
				class="mt-1 w-full rounded-control border p-2 font-mono text-xs"
				value={payload}></textarea>

			<div class="mt-3 flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="copy-payload"
					onclick={copy}
					class="rounded-control border border-border px-3 py-1.5 text-sm"
				>
					{copied ? m.connect_copied() : m.connect_copy()}
				</button>
				{#if step !== 'replying'}
					<button
						type="button"
						data-testid="refresh-invite"
						onclick={refreshInvite}
						class="rounded-control border border-border px-3 py-1.5 text-sm"
					>
						{m.connect_refresh()}
					</button>
				{/if}
			</div>
		{/if}

		<label class="mt-6 block text-sm text-muted" for="inbound">{m.connect_paste()}</label>
		<textarea
			id="inbound"
			data-testid="inbound-payload"
			rows="4"
			bind:value={inbound}
			class="mt-1 w-full rounded-control border p-2 font-mono text-xs"></textarea>
		<button
			type="button"
			data-testid="submit-inbound"
			disabled={!$signallingStore}
			onclick={() => handleInbound(inbound)}
			class="mt-3 rounded-control border border-border px-3 py-1.5 text-sm disabled:opacity-50"
		>
			{m.connect_paste()}
		</button>
	</details>

	<!-- A modal of its own, so nothing here has to make room for a camera that is
	     not running. It releases the camera on every way out, including this page
	     being navigated away from. -->
	<qr-scanner
		bind:this={scanner}
		label={m.connect_scan()}
		data-testid="scanner"
		onscan={(/** @type {any} */ event) => onScanned(event.detail.text)}
		onclose={() => (scanning = false)}
	></qr-scanner>
</StudioGate>

<!--
	The explanation, one press from the badge rather than only in the handbook.

	Short on purpose: the full account of NATs, hotel wifi and what a relay
	discloses lives in the handbook, and duplicating it here would give two
	versions to keep in step. What this owes the reader is the shape of the
	problem and the way out, in the moment they hit it.
-->
<Modal bind:open={reachOpen} title={m.connect_reach_title()} testid="reach-modal">
	<p class="text-sm">{m.connect_reach_same_room()}</p>
	<p class="mt-3 text-sm">{m.connect_reach_remote()}</p>
	<p class="mt-3 text-sm text-muted">{m.connect_reach_why()}</p>
	<p class="mt-3 text-sm">{m.connect_reach_remedy()}</p>
	<p class="mt-4 text-sm">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="{base}/handbuch/connecting" class="underline" data-testid="reach-handbook">
			{m.connect_reach_more()}
		</a>
	</p>
</Modal>
