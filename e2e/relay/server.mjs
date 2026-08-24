// A relay of our own, for the tests that need one.
//
// Phase 4 of #94 has to show that two devices meet through a relay without a QR
// code, and neither of the obvious ways to test that works:
//
//   the production relay — makes the suite depend on a machine on the internet,
//                          so a red run says nothing about this code
//   its real limits      — a relayed connection there lives 20 minutes, and a
//                          test that watches a wall clock is not a test
//
// So the suite brings its own, with limits small enough to be *reached* inside a
// test. Twelve seconds of connection duration is absurd in production and is
// exactly what makes "the connection outlived its limit" a thing that can be
// asserted rather than waited for.
//
// The peer id is derived from a fixed seed, so the address is knowable before
// the process starts and nothing has to be parsed out of its output.

import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { gossipsub } from '@libp2p/gossipsub';
import { identify, identifyPush } from '@libp2p/identify';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p } from 'libp2p';

/** Fixed on purpose — see the note above about the address being knowable. */
export const RELAY_SEED = new Uint8Array(32).fill(7);
export const RELAY_PEER_ID = '12D3KooWRawPbxPtP1eZaJpumGnyWX2DcUyd3RQnydr3eAto4Az7';
export const RELAY_PORT = 4184;

/** Where a browser reaches this relay. */
export const RELAY_ADDRESS = `/ip4/127.0.0.1/tcp/${RELAY_PORT}/ws/p2p/${RELAY_PEER_ID}`;

/**
 * Deliberately far below anything sane for a real relay.
 *
 * A production relay grants twenty minutes and gigabytes; nothing in a test
 * would ever reach that, so a test against it can only assert that a connection
 * exists — which is true of a circuit that is about to die as well.
 *
 * Thirty seconds rather than the twelve this started with. Twelve made the test
 * measure two things at once: whether the peers upgrade to a direct path *and*
 * whether they manage it quickly, and on a loaded machine the second swallowed
 * the first. Long enough that the upgrade is not racing the limit, short enough
 * that waiting past it is still a test rather than a coffee break.
 */
const DURATION_LIMIT_MS = 30_000;
const DATA_LIMIT_BYTES = BigInt(1024 * 1024);

/** The topic the app announces itself on — kept in step with libp2p-config.js. */
export const DISCOVERY_TOPIC = 'yogasuci/discovery/1.0.0';

export async function startTestRelay() {
	const privateKey = await generateKeyPairFromSeed('Ed25519', RELAY_SEED);

	const relay = await createLibp2p({
		privateKey,
		addresses: { listen: [`/ip4/127.0.0.1/tcp/${RELAY_PORT}/ws`] },
		transports: [webSockets()],
		// libp2p 3 has no defaults for these, and without them a dial fails with
		// "At least one protocol must be specified" — which reads like a
		// configuration typo rather than a missing capability.
		connectionEncrypters: [noise()],
		streamMuxers: [yamux()],
		services: {
			identify: identify(),
			identifyPush: identifyPush(),
			relay: circuitRelayServer({
				reservations: {
					maxReservations: 100,
					reservationTtl: 60_000,
					defaultDurationLimit: DURATION_LIMIT_MS,
					defaultDataLimit: DATA_LIMIT_BYTES
				}
			}),
			// Peers announce themselves to each other *through* the relay, so it has
			// to carry the topic. Without this the two browsers would reserve a slot
			// each and never hear of one another.
			pubsub: gossipsub({
				emitSelf: false,
				allowPublishToZeroTopicPeers: true,
				runOnLimitedConnection: true
			})
		}
	});

	// Gossipsub forwards a topic only to peers in its mesh for that topic, and it
	// joins a mesh only for topics it is subscribed to. A relay that does not
	// subscribe therefore carries reservations perfectly well and drops every
	// announcement — the browsers reserve a slot each and never hear of one
	// another, which is exactly what happened before this line.
	relay.services.pubsub.subscribe(DISCOVERY_TOPIC);

	if (process.env.RELAY_TRACE === '1') {
		relay.services.pubsub.addEventListener('message', (event) => {
			if (event.detail.topic !== DISCOVERY_TOPIC) return;
			console.log(`[trace] announcement from ${event.detail.from?.toString().slice(-8)}`);
		});
		relay.addEventListener('peer:connect', (e) =>
			console.log(`[trace] peer connected ${e.detail.toString().slice(-8)}`)
		);
		setInterval(() => {
			const mesh = relay.services.pubsub.getMeshPeers?.(DISCOVERY_TOPIC) ?? [];
			const subs = relay.services.pubsub.getSubscribers?.(DISCOVERY_TOPIC) ?? [];
			console.log(
				`[trace] mesh=${JSON.stringify(mesh.map((p) => String(p).slice(-8)))} subscribers=${JSON.stringify(subs.map((p) => String(p).slice(-8)))}`
			);
		}, 8000);
	}

	return relay;
}

// Started as its own process by Playwright, which waits for the port.
if (import.meta.url === `file://${process.argv[1]}`) {
	const relay = await startTestRelay();

	console.log(`test relay listening: ${RELAY_ADDRESS}`);

	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			void relay.stop().then(() => process.exit(0));
		});
	}
}
