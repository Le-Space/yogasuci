import { describe, expect, it } from 'vitest';

import { createLibp2pConfig, denyDial } from './libp2p-config.js';

const PEER = '/p2p/12D3KooWAX2ARgYnWjrAPHiM9hAXBvGUaQ9iK1PBNCV4FbMBRDVu';
const RELAY = `/dns4/relay.example/tcp/443/tls/ws${PEER}`;

describe('a node nobody asked to use a relay', () => {
	// This is the promise, not a preference: a start without the choice makes no
	// outbound call. A relay address in the environment is not consent, so the
	// address is passed here on purpose — a test that omitted it would pass for
	// the wrong reason and would keep passing if the gate were deleted.

	it('announces no circuit address and discovers nobody', async () => {
		const config = createLibp2pConfig({ relayBootstrapAddrs: [RELAY] });

		expect(config.addresses.listen).toEqual([]);
		expect(config.peerDiscovery).toEqual([]);
	});

	it('refuses to dial the relay it was handed', () => {
		expect(denyDial(RELAY, false)).toBe(true);
		expect(denyDial(`${RELAY}/p2p-circuit`, false)).toBe(true);
	});

	it('still dials a QR session, which is the way in that needs no server', () => {
		expect(
			denyDial(`/webrtc/p2p/12D3KooWAX2ARgYnWjrAPHiM9hAXBvGUaQ9iK1PBNCV4FbMBRDVu`, false)
		).toBe(false);
	});

	it('keeps the transports a relay would need, so switching one on needs no new node', () => {
		// Foreclosing this is what would force the whole stack to restart when
		// somebody ticks the box mid-session.
		const config = createLibp2pConfig();

		expect(config.transports.length).toBe(3);
	});
});

describe('a node somebody did ask', () => {
	it('announces a circuit address and both kinds of discovery', () => {
		// Two, and they answer different questions: `bootstrap` is how this node
		// reaches the relay at all, `pubsubPeerDiscovery` is how it learns about
		// everyone else who did the same. Counted rather than merely "not empty",
		// so dropping one of them fails here instead of quietly halving what the
		// relay is for (#94).
		const config = createLibp2pConfig({ relayOptIn: true, relayBootstrapAddrs: [RELAY] });

		// Both, and the second is not decoration: `/p2p-circuit` says "reachable
		// through a relay", `/webrtc` says "and then dial me here instead". Without
		// it a relayed connection stays relayed and ends with the relay's duration
		// limit — measured as a circuit that vanished after twelve seconds before
		// this was added (#94).
		expect(config.addresses.listen).toEqual(['/p2p-circuit', '/webrtc']);
		expect(config.peerDiscovery).toHaveLength(2);
	});

	it('hole punches, so a relayed connection can become a direct one', () => {
		// Without DCUtR a circuit stays a circuit, and "the relay brokers the
		// connection and the data then flows directly" would be a sentence with
		// nothing behind it — while the relay's own duration limit ends the
		// connection anyway.
		const config = createLibp2pConfig({ relayOptIn: true, relayBootstrapAddrs: [RELAY] });

		expect(config.services.dcutr).toBeDefined();
	});

	it('takes the transports it cannot import itself', () => {
		// `webRTC()` is handed in rather than imported by the config: it reaches a
		// native module node does not have, and importing it here stopped this very
		// file from loading — which took the "no outbound call" guard with it.
		const marker = () => 'webrtc';
		const config = createLibp2pConfig({ relayOptIn: true, extraTransports: [marker] });

		expect(config.transports).toContain(marker);
	});

	it('asks for nothing when there is no address to ask', () => {
		// The choice without an address is nothing to dial, and announcing
		// `/p2p-circuit` then would publish an address nobody can use.
		const config = createLibp2pConfig({ relayOptIn: true });

		expect(config.addresses.listen).toEqual([]);
		expect(config.peerDiscovery).toEqual([]);
	});

	it('dials the relay and circuits through it, and nothing else', () => {
		expect(denyDial(RELAY, true)).toBe(false);
		expect(denyDial(`${RELAY}/p2p-circuit${PEER}`, true)).toBe(false);

		// A bootstrap list is not permission to dial the whole internet.
		expect(denyDial(`/ip4/1.2.3.4/tcp/4001${PEER}`, true)).toBe(true);
		expect(denyDial(`/ip4/1.2.3.4/udp/4001/quic-v1${PEER}`, true)).toBe(true);
	});

	it('denies plaintext websocket on an https page, where the browser would anyway', () => {
		// Allowing it buys a console full of mixed-content errors and a relay
		// that looks broken rather than misconfigured.
		const plain = `/ip4/203.0.113.9/tcp/9092/ws${PEER}`;

		expect(denyDial(plain, true, 'https:')).toBe(true);
		// On http — local development, CI — the same address is fine.
		expect(denyDial(plain, true, 'http:')).toBe(false);
	});
});
