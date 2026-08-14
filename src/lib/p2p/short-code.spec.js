// Runs in node, like everything here: the suite has no DOM environment on
// purpose (vite.config.js), so storage is stubbed the way handoff.spec.js stubs
// BroadcastChannel. That is not a compromise for this module — the interesting
// cases are "there is no storage" and "storage throws", and a real localStorage
// is the one thing that cannot produce either on demand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setShortCodeEnabled, shortCodeEnabled } from './short-code.js';

/** @param {{ onGet?: () => void, onSet?: () => void }} [hooks] */
function fakeStorage(hooks = {}) {
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

describe('what a device hands out by default', () => {
	it('is the long payload', () => {
		// The safety argument for the whole feature is this one line. Upstream
		// measured four of eight connections under load going silent on the compact
		// format, and a booking system cannot afford two devices that look paired
		// while the tickets sold on one never arrive on the other. Flipping this
		// default is a decision, and it should have to be made in this file.
		expect(shortCodeEnabled()).toBe(false);
	});

	it('remembers a studio that turned it on', () => {
		setShortCodeEnabled(true);

		expect(shortCodeEnabled()).toBe(true);
	});

	it('goes back to the long payload when it is turned off again', () => {
		setShortCodeEnabled(true);
		setShortCodeEnabled(false);

		expect(shortCodeEnabled()).toBe(false);
	});
});

describe('a device that cannot use storage', () => {
	it('falls back to the default rather than throwing on the connect screen', () => {
		// Safari with cookies blocked throws on access rather than returning null.
		// The screen this runs on exists to make a connection, and it must not die
		// on a preference.
		vi.stubGlobal(
			'localStorage',
			fakeStorage({
				onGet: () => {
					throw new Error('The operation is insecure.');
				}
			})
		);

		expect(shortCodeEnabled()).toBe(false);
	});

	it('does not throw when the setting cannot be saved', () => {
		vi.stubGlobal(
			'localStorage',
			fakeStorage({
				onSet: () => {
					throw new Error('The operation is insecure.');
				}
			})
		);

		expect(() => setShortCodeEnabled(true)).not.toThrow();
	});

	it('answers at all where there is no storage object', () => {
		vi.stubGlobal('localStorage', undefined);

		expect(shortCodeEnabled()).toBe(false);
		expect(() => setShortCodeEnabled(true)).not.toThrow();
	});
});

describe('two tabs are one studio', () => {
	it('sees a change made elsewhere rather than an answer it cached', () => {
		// The invite screen asks again for every offer it builds. Caching the first
		// answer would let it keep handing out the old format after the setting was
		// changed in another tab — visible only as a code that stays the wrong size.
		expect(shortCodeEnabled()).toBe(false);

		localStorage.setItem('yogasuci:short-code', 'on');

		expect(shortCodeEnabled()).toBe(true);
	});
});
