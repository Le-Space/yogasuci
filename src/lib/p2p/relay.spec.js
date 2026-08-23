// Runs in node, like short-code.spec.js and for the same reason: the cases
// worth pinning are "there is no storage" and "storage throws", and a real
// localStorage is the one thing that cannot produce either on demand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	bakedRelayAddresses,
	isUsableRelayAddress,
	relayAddress,
	relayAddresses,
	relayEnabled,
	setRelayAddress,
	setRelayEnabled
} from './relay.js';

function fakeStorage(/** @type {{ onGet?: () => void, onSet?: () => void }} */ hooks = {}) {
	const values = new Map();

	return {
		/** @param {string} key */
		getItem(key) {
			hooks.onGet?.();
			return values.has(key) ? values.get(key) : null;
		},
		/** @param {string} key @param {string} value */
		setItem(key, value) {
			hooks.onSet?.();
			values.set(key, value);
		},
		/** @param {string} key */
		removeItem(key) {
			values.delete(key);
		}
	};
}

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('whether this device may use a relay', () => {
	it('is off until somebody says otherwise', () => {
		// Not a preference among equals. Off is what makes "this device calls
		// nobody" true, and that sentence is the whole promise (#94).
		expect(relayEnabled()).toBe(false);
	});

	it('remembers being switched on', () => {
		setRelayEnabled(true);

		expect(relayEnabled()).toBe(true);
	});

	it('goes back off', () => {
		setRelayEnabled(true);
		setRelayEnabled(false);

		expect(relayEnabled()).toBe(false);
	});

	it('is read again each time rather than remembered in the module', () => {
		// Two tabs are one device. A cached answer would leave one of them
		// refusing to dial after the other had been allowed to.
		let reads = 0;
		vi.stubGlobal('localStorage', fakeStorage({ onGet: () => reads++ }));

		relayEnabled();
		relayEnabled();

		expect(reads).toBe(2);
	});
});

describe('a browser that will not store anything', () => {
	it('answers off rather than throwing', () => {
		// Safari locked down, or cookies blocked. The screen this setting lives on
		// exists to make a connection; it must not fall over reading a checkbox.
		vi.stubGlobal('localStorage', {
			getItem() {
				throw new Error('denied');
			},
			setItem() {
				throw new Error('denied');
			},
			removeItem() {}
		});

		expect(relayEnabled()).toBe(false);
		expect(() => setRelayEnabled(true)).not.toThrow();
	});

	it('answers off when there is no storage at all', () => {
		vi.stubGlobal('localStorage', undefined);

		expect(relayEnabled()).toBe(false);
	});
});

describe('which relay this device would use', () => {
	const OWN =
		'/dns4/relay.example.com/tcp/443/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh';

	it('falls back to the ones shipped with the app', () => {
		expect(relayAddresses()).toEqual(bakedRelayAddresses());
		expect(bakedRelayAddresses().length).toBeGreaterThan(1);
	});

	it('ships several routes to the same machine, not one', () => {
		// A 2n6 name and an AutoTLS name reach it differently, over v4 and v6. A
		// studio behind an IPv6-only network and one behind IPv4-only both need a
		// way in, and one route failing must not be the relay failing.
		const kinds = new Set(bakedRelayAddresses().map((a) => a.split('/')[1]));

		expect([...kinds].sort()).toEqual(['dns4', 'dns6']);
	});

	it('uses an entered address instead of them, not beside them', () => {
		// Replacing is the point. Somebody who names their relay has said which
		// machine they trust with the fact that they are connecting; quietly
		// dialling ours as well would take that back.
		setRelayAddress(OWN);

		expect(relayAddresses()).toEqual([OWN]);
	});

	it('goes back to the shipped ones when the field is cleared', () => {
		setRelayAddress(OWN);
		setRelayAddress('');

		expect(relayAddress()).toBe('');
		expect(relayAddresses()).toEqual(bakedRelayAddresses());
	});
});

describe('whether an address can be used at all', () => {
	it('takes a multiaddr that names a peer', () => {
		expect(
			isUsableRelayAddress(
				'/dns4/improve-empty-grass-tent.2n6.me/tcp/443/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh'
			)
		).toBe(true);
	});

	it('refuses one without a peer id', () => {
		// The address of a machine, but not of a *particular* machine. A relay is
		// exactly the one to be sure about.
		expect(isUsableRelayAddress('/dns4/relay.example.com/tcp/443/tls/ws')).toBe(false);
	});

	it('refuses something that is not an address', () => {
		expect(isUsableRelayAddress('relay.example.com')).toBe(false);
		expect(isUsableRelayAddress('')).toBe(false);
		expect(isUsableRelayAddress('/nonsense/1')).toBe(false);
	});
});
