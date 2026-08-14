// The QR handshake: build a WebRTC session out of band, then hand it to
// libp2p as a finished connection.
//
// Shape of the exchange — the same three steps whether the payload travels as
// a scanned QR code, a pasted string or a shared message:
//
//   A: createOffer()      → offer payload   ──(QR / paste / share)──▶ B
//   B: acceptOffer(text)  → answer payload  ◀──(QR / paste / share)── A
//   A: acceptAnswer(text) → connection open
//
// The handshake itself now comes from the package as QRSession. This file was
// a second implementation of it - written here without knowing the demo had one,
// and arriving at the same three bugs and the same retry loop by hitting them.
// What is left is the shape this application already speaks: `acceptOffer`
// returning a `connected` promise, `discardUnusedOffers`, and `classify`.
//
// Kept free of Svelte and OrbitDB so the flow can be unit tested and so the
// stores in ./node.js stay a thin layer on top.

import { QRSession, parsePayload, QR_TYPE_OFFER } from '@le-space/libp2p-webrtc-qr';

import { rtcConfiguration } from './libp2p-config.js';
import { shortCodeEnabled } from './short-code.js';

const ICE_GATHERING_TIMEOUT_MS = 15_000;

// How long a connection may take to come up. Generous on purpose: a mobile
// network behind carrier NAT can need minutes of ICE before it succeeds, and
// the old 30 s cut those off mid-setup — which at a counter looks like "it just
// does not work here". Nothing is lost by waiting, because a connection that
// genuinely fails never reaches this: the package rejects on the 'failed' and
// 'closed' events as soon as they arrive. That is upstream's guarantee now, not
// ours — which is why session.spec.js pins that these numbers arrive there
// rather than re-testing the waiting itself.
const CONNECTION_TIMEOUT_MS = 360_000;

// The dial runs inside a retry loop, so each attempt has to stay short: one hung
// attempt with a long signal would eat the whole budget and turn the retries
// into a single try. The package owns that timeout now - see connectionTimeout
// below for why it cannot be shortened to match.
/** How long the answering side keeps retrying while the offerer attaches its muxer. */
const DIAL_ATTEMPTS = 15;
const DIAL_RETRY_MS = 300;

/**
 * @param {any} node - a started libp2p node; QRSession attaches its transport to it
 */
export function createSignalling(node) {
	const session = new QRSession(node, {
		rtcConfiguration,
		iceGatheringTimeout: ICE_GATHERING_TIMEOUT_MS,
		// The answering side waits minutes, not seconds: a code travelling by
		// message is answered at human speed.
		answerWaitTimeout: CONNECTION_TIMEOUT_MS,
		// One knob in the package covers both waiting for the connection and the
		// upgrade's abort signal. It has to be the longer of the two: a real
		// failure rejects on the connection state event and never reaches the
		// timeout, so the six minutes only ever apply to a peer that is slow
		// rather than gone - and cutting it to the upgrade's thirty seconds made
		// the camera handshake fail under load.
		connectionTimeout: CONNECTION_TIMEOUT_MS,
		dialAttempts: DIAL_ATTEMPTS,
		dialRetryDelay: DIAL_RETRY_MS
	});

	/**
	 * Step 1 (offering device): make an offer to show.
	 *
	 * The format is decided per offer rather than once when the session is built.
	 * A studio can turn short codes on with the connect screen already open, and
	 * the next invitation has to be the format they just chose — so the setting is
	 * read at the moment of the offer rather than captured above.
	 *
	 * Only this direction is a choice. Reading is unconditional in the package, so
	 * a device with the setting off still accepts a short code from a device that
	 * has it on, and the answer comes back in whatever format the offer arrived in.
	 *
	 * @returns {Promise<string>} the payload to display
	 */
	function createOffer() {
		return session.createOffer({ compact: shortCodeEnabled() });
	}

	/**
	 * Step 2 (answering device): verify the offer and answer it.
	 *
	 * The answer is ready long before the link is up, so `connected` is handed
	 * back separately rather than awaited here - the caller has a code to show
	 * and no reason to wait for the far side to read it.
	 *
	 * @param {string} text
	 */
	async function acceptOffer(text) {
		const parsed = await parsePayload(text);

		if (parsed?.peerId === node.peerId.toString()) {
			throw new Error('This code was created by this device. Scan the other device.');
		}

		const connected = new Promise((resolve, reject) => {
			const onConnect = (/** @type {any} */ event) => {
				if (event.detail.peerId !== parsed.peerId) return;
				cleanup();
				resolve(undefined);
			};
			const onError = (/** @type {any} */ event) => {
				if (event.detail.peerId !== parsed.peerId) return;
				cleanup();
				reject(event.detail.error);
			};
			function cleanup() {
				session.removeEventListener('connect', onConnect);
				session.removeEventListener('error', onError);
			}

			session.addEventListener('connect', onConnect);
			session.addEventListener('error', onError);
		});

		// Nobody is waiting on this until the caller decides to; without a
		// handler an inbound failure would surface as an unhandled rejection.
		connected.catch(() => {});

		const answer = await session.acceptOffer(text);

		return { answer, remotePeerId: parsed.peerId, connected };
	}

	/**
	 * Step 3 (offering device): verify the answer and open the connection.
	 *
	 * `{ dial: false }` stops after the verify: signature, session match and the
	 * remote description, all of it local work that finishes in milliseconds. It
	 * exists for the one caller that has to answer "is this reply mine?" before
	 * it is allowed to take the time to act on it - see the handoff in
	 * `routes/connect`. Dial afterwards with `connect`.
	 *
	 * @param {string} text
	 * @param {{ dial?: boolean }} [options]
	 * @returns {Promise<string>} the remote peer id
	 */
	async function acceptAnswer(text, options = {}) {
		try {
			const { peerId } = await session.acceptAnswer(text, options);

			return peerId;
		} catch (/** @type {any} */ error) {
			// The package says "belongs to a different session"; this application
			// says it in its own words, and the connect screen matches on those to
			// decide whether a reply opened in a fresh tab deserves an explanation
			// rather than a stack trace. Translating here keeps that contract in
			// one place instead of spreading package wording through the UI.
			if (/different session/i.test(error?.message ?? '')) {
				throw new Error('This reply belongs to a different connection attempt.');
			}

			throw error;
		}
	}

	/**
	 * Which half of the exchange a scanned payload is. Routing only - it does
	 * not verify anything, and the step it routes to does.
	 *
	 * @param {string} text
	 */
	async function classify(text) {
		const parsed = await parsePayload(text);
		return parsed.type === QR_TYPE_OFFER ? 'offer' : 'answer';
	}

	/**
	 * Close offers nobody ever answered, keeping none.
	 *
	 * The connect screen keeps its invitation fresh by making a new offer every
	 * few minutes, and without this each refresh would strand an
	 * RTCPeerConnection that stays open for the lifetime of the page. Sessions
	 * that have been answered are left alone - that is a front desk pairing with
	 * one student after another, which must keep working.
	 */
	function discardUnusedOffers() {
		for (const [id, offer] of session.offers) {
			if (offer.remotePeerId !== null) continue;
			offer.peerConnection.close();
			session.offers.delete(id);
		}
	}

	return {
		createOffer,
		acceptOffer,
		acceptAnswer,
		/**
		 * Open the libp2p connection to a peer whose answer has been accepted with
		 * `{ dial: false }`. Retries internally, so this is the slow half.
		 *
		 * @param {string} peerId
		 */
		connect: (peerId) => session.dial(peerId),
		classify,
		// The peer connections themselves, so diagnostics can report what WebRTC
		// thinks. A stalled handshake stalls underneath libp2p, where the only
		// symptom above is a screen that never changes.
		get offers() {
			return session.offers;
		},
		get inbound() {
			return session.inbound;
		},
		close: () => session.close(),
		discardUnusedOffers,
		getOutboundSession: (/** @type {string} */ peerId) => session.getOutboundSession(peerId)
	};
}
