// Runs in node, like short-code.spec.js and for the same reason: the cases
// worth pinning are "there is no storage" and "storage throws", and a real
// localStorage is the one thing that cannot produce either on demand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { relayEnabled, setRelayEnabled } from './relay.js';

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
