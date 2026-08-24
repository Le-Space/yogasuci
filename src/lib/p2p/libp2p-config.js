// libp2p node configuration — relay-optional by construction.
//
// The default transport is @le-space/libp2p-webrtc-qr, and a connection exists
// only after a human carried a signed SDP payload from one device to the other.
// That path needs no server and still does not have one.
//
// What changed is the *second* way in. Carrying a code works when both people
// are in the room; over a messenger it does not, because nobody is there to
// hold a phone up. So a relay can be switched on — and the promise that
// replaces "relay-free" is stricter than a default, because a default is only
// a starting value: **a start without the choice makes no outbound call at
// all.** The transports below are capability, not usage. Nothing dials until
// `relayOptIn` is true, there is no bootstrap list, no `/p2p-circuit` to
// announce, and the gater refuses every address that is not a QR session.
//
// A relay that is switched on brokers the *connection*. The data then flows
// directly between the devices. Where data should be pinned, only
// `orbitdb-relay` will do — `uc-go-peer` stores nothing (CLAUDE.md).
//
// Gossipsub is the one service that looks like infrastructure and is not:
// OrbitDB's replication needs a pubsub instance to exchange log heads, and it
// runs entirely inside the direct WebRTC connection the QR handshake built.

import { bootstrap } from '@libp2p/bootstrap';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { gossipsub } from '@libp2p/gossipsub';
import { identify, identifyPush } from '@libp2p/identify';
import { webSockets } from '@libp2p/websockets';
import { webRTCQR } from '@le-space/libp2p-webrtc-qr';

/**
 * The topic peers announce themselves on.
 *
 * Named for this application rather than the library default: the relay is
 * shared, and a default topic would have every project that ever used it
 * announcing into one room.
 */
export const DISCOVERY_TOPIC = 'yogasuci/discovery/1.0.0';

/**
 * ICE servers used while gathering candidates.
 *
 * STUN only ever tells a device its own public address; no user data and no
 * signalling passes through it, so it does not make the app server-dependent.
 * It is still a third-party lookup — see docs/LIMITS.md — hence configurable,
 * and switched off entirely with `?ice=host` (LAN and CI, where host
 * candidates are deterministic).
 *
 * @returns {RTCConfiguration}
 */
export function rtcConfiguration() {
	if (iceMode() === 'host') return { iceServers: [] };

	const configured = import.meta.env?.VITE_STUN_SERVERS;
	const urls = (configured || 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478')
		.split(',')
		.map((/** @type {string} */ url) => url.trim())
		.filter(Boolean);

	return { iceServers: [{ urls }] };
}

const ICE_MODE_KEY = 'yoga-p2p.iceMode';

/**
 * The ICE mode, remembered for the session.
 *
 * `?ice=host` is a property of *this session*, not of the page it was typed on:
 * the app routes client-side, so requiring the parameter on every URL would
 * mean a single in-app navigation silently switches STUN back on. Reading it
 * once and remembering it keeps the choice where the user made it.
 *
 * @returns {string | null}
 */
export function iceMode() {
	if (typeof location === 'undefined') return null;

	const fromUrl = new URLSearchParams(location.search).get('ice');

	try {
		if (fromUrl) {
			sessionStorage.setItem(ICE_MODE_KEY, fromUrl);
			return fromUrl;
		}
		return sessionStorage.getItem(ICE_MODE_KEY);
	} catch {
		// Storage blocked — fall back to whatever this URL says.
		return fromUrl;
	}
}

/**
 * Is this address one this node may dial?
 *
 * Exported because it is the whole of the promise in one function, and a
 * promise that can only be checked by starting a node is one nobody checks.
 *
 * With the relay off, a QR session is the only thing that may be dialed - the
 * same rule this node has always had. With it on, the relay itself and the
 * circuits through it are added, and nothing else: a bootstrap list is not
 * permission to dial the whole internet.
 *
 * Plaintext WebSocket stays denied either way. A browser on an https page
 * refuses the dial as mixed content anyway, so allowing it here only buys a
 * console full of errors and a relay that looks broken rather than misconfigured.
 *
 * @param {string} address
 * @param {boolean} relayOptIn
 * @param {string} [protocol] The page's protocol; defaults to this page's.
 * @returns {boolean} `true` to deny.
 */
export function denyDial(address, relayOptIn, protocol = globalThis.location?.protocol) {
	const addr = String(address);

	// The QR transport only ever produces /webrtc/p2p/<peer> addresses.
	if (addr.includes('/webrtc/p2p/')) return false;
	if (!relayOptIn) return true;

	const secureWebSocket = addr.includes('/wss') || addr.includes('/tls/ws');
	const plaintextWebSocket = !secureWebSocket && addr.includes('/ws');
	if (plaintextWebSocket && protocol === 'https:') return true;

	return !(addr.includes('/p2p-circuit') || secureWebSocket || plaintextWebSocket);
}

/**
 * @param {object} [options]
 * @param {(remotePeerId: string) => unknown} [options.getOutboundSession]
 *   Returns the upgrade context for a peer whose answer was already verified.
 * @param {boolean} [options.relayOptIn] Whether somebody asked for a relay.
 *   Defaults to `false`, and the default is the promise: a node built without
 *   it makes no outbound call.
 * @param {readonly string[]} [options.relayBootstrapAddrs] Relay addresses to
 *   bootstrap from. Ignored entirely unless `relayOptIn` is true, so passing
 *   them is never by itself a decision to use one.
 * @param {readonly any[]} [options.extraTransports] Transports the caller built.
 *   `webRTC()` arrives this way rather than being imported here, and not for
 *   taste: it pulls in `node-datachannel`, a native module that does not exist
 *   in node — importing it made this file unloadable there and took
 *   libp2p-config.spec.js with it, which is the one test that guards "off means
 *   no outbound call". A promise whose test cannot run is not a promise.
 * @returns {any} a libp2p init object
 */
export function createLibp2pConfig({
	getOutboundSession = () => null,
	relayOptIn = false,
	relayBootstrapAddrs = [],
	extraTransports = []
} = {}) {
	// Both conditions, not either: an address without the choice is a relay
	// nobody asked for, and the choice without an address is nothing to dial.
	const relays = relayOptIn ? [...relayBootstrapAddrs].filter(Boolean) : [];
	const hasRelay = relays.length > 0;

	return {
		addresses: {
			// `/p2p-circuit` means "reachable through a relay", so announcing it
			// without one is an address nobody can use. Without a relay this node
			// is never dialable out of the blue: a session is built by the
			// application first, then dialed.
			// `/p2p-circuit` says "reachable through a relay". `/webrtc` says
			// "and once you have reached me that way, dial me here instead" — it is
			// what lets two browsers end up talking directly, since neither can
			// listen on a socket and classic hole punching therefore never applies
			// to them.
			//
			// Without the second, a relayed connection stays a relayed connection and
			// dies when the relay's duration limit runs out: measured as a circuit
			// that vanished the moment the test relay's grant expired — twelve
			// seconds when this was measured, twenty minutes on the real one (#94).
			listen: hasRelay ? ['/p2p-circuit', '/webrtc'] : []
		},
		// The transports are capability rather than usage. They dial nothing on
		// their own, and keeping them present unconditionally means switching a
		// relay on later does not need a different node - which is what would
		// otherwise force a restart of the whole stack mid-session.
		// `webRTC()` beside the QR transport, and they do different jobs: the QR one
		// carries an offer somebody scanned, this one is dialed *through* a relayed
		// connection so two peers can end up talking directly. Without it a circuit
		// stays a circuit, and "the relay brokers the connection, the data flows
		// directly" would be a sentence with nothing behind it (#94).
		transports: [
			webRTCQR({ getOutboundSession }),
			...extraTransports,
			circuitRelayTransport(),
			webSockets()
		],
		// Needed by every transport except the QR one, which brings its own: a
		// WebSocket to a relay, and the circuit through it, are ordinary libp2p
		// connections and libp2p 3 ships no defaults for these. Without them the
		// dial fails with "At least one protocol must be specified" and the node
		// simply never reaches the relay — no error on any screen, no connection,
		// nothing to point at (#94).
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		connectionGater: {
			denyDialMultiaddr: (/** @type {{ toString: () => string }} */ addr) =>
				denyDial(String(addr), relayOptIn)
		},
		// Discovery only ever from a relay that was asked for. No relay, no list,
		// and `peerDiscovery` stays empty - which is what makes "no outbound
		// call" true of the node rather than only of the dialog.
		// Two kinds, and only with a relay. `bootstrap` is how this node reaches the
		// relay at all; `pubsubPeerDiscovery` is how it learns about the others that
		// did the same. The second is what makes "the studio is on, the students
		// open the app, and they find each other" true — and it is a broadcast, so
		// everyone on the topic learns every peer id and address (#94).
		peerDiscovery: hasRelay
			? [
					bootstrap({ list: [...relays] }),
					pubsubPeerDiscovery({
						interval: 10_000,
						topics: [DISCOVERY_TOPIC],
						listenOnly: false
					})
				]
			: [],
		services: {
			identify: identify(),
			identifyPush: identifyPush(),
			// Hole punching. A relayed connection is limited by design — the relay
			// grants it a duration and a data budget — and this is what turns it into
			// a direct one before that runs out. Present unconditionally like the
			// transports: it acts only on connections that exist.
			dcutr: dcutr(),
			pubsub: gossipsub({
				emitSelf: false,
				allowPublishToZeroTopicPeers: true,
				// A QR session is a single direct connection; without this,
				// gossipsub would refuse to graft its mesh onto it.
				runOnLimitedConnection: true
			})
		}
	};
}
