import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearActiveAccount, setActiveAccount } from '../identity/account.js';
import { createKeyFor, forgetKey, keyFor, rememberKey } from './keys.js';
import { newKey } from './encryption.js';

const STUDIO = 'did:key:zStudio';
const STUDENT = 'did:key:zStudent';

function fakeStorage(seed = {}) {
	const values = new Map(Object.entries(seed));
	return {
		getItem: (/** @type {string} */ key) => (values.has(key) ? values.get(key) : null),
		setItem: (/** @type {string} */ key, /** @type {string} */ value) => values.set(key, value),
		removeItem: (/** @type {string} */ key) => values.delete(key)
	};
}

const same = (/** @type {any} */ a, /** @type {any} */ b) =>
	a != null && b != null && [...a].join(',') === [...b].join(',');

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
	setActiveAccount(STUDIO);
});

afterEach(() => {
	clearActiveAccount();
	vi.unstubAllGlobals();
});

describe('the keys a device holds', () => {
	it('gives back the key it was given', () => {
		const key = newKey();
		rememberKey('yoga-bookings-abc', key);

		expect(same(keyFor('yoga-bookings-abc'), key)).toBe(true);
	});

	it('survives being written and read as text', () => {
		// Storage holds strings; a key is bytes. Pinned because a rounding of that
		// conversion would produce a key that opens nothing, at the point where the
		// data is already written.
		const key = createKeyFor('yoga-tickets-abc');

		expect(keyFor('yoga-tickets-abc')).toBeInstanceOf(Uint8Array);
		expect(same(keyFor('yoga-tickets-abc'), key)).toBe(true);
	});

	it('says it has none rather than inventing one', () => {
		// Inventing a key would make a database only this device can read, without
		// anybody being told. Not opening it is the better failure.
		expect(keyFor('yoga-bookings-nobody')).toBe(null);
	});

	it('does not make a second key for a database it already has one for', () => {
		const first = createKeyFor('yoga-bookings-abc');
		const second = createKeyFor('yoga-bookings-abc');

		expect(same(first, second)).toBe(true);
	});

	it('forgets one when asked', () => {
		createKeyFor('yoga-bookings-abc');
		forgetKey('yoga-bookings-abc');

		expect(keyFor('yoga-bookings-abc')).toBe(null);
	});
});

describe('two passkeys on one device', () => {
	it('do not share keys', () => {
		// The point of scoping this per account: a personal passkey must not be able
		// to open what the studio passkey holds, on the same phone (#82).
		const studioKey = createKeyFor('yoga-bookings-abc');

		setActiveAccount(STUDENT);

		expect(keyFor('yoga-bookings-abc')).toBe(null);

		const studentKey = createKeyFor('yoga-bookings-abc');
		expect(same(studentKey, studioKey)).toBe(false);
	});

	it('each keep their own after switching back', () => {
		const studioKey = createKeyFor('yoga-bookings-abc');
		setActiveAccount(STUDENT);
		createKeyFor('yoga-bookings-abc');
		setActiveAccount(STUDIO);

		expect(same(keyFor('yoga-bookings-abc'), studioKey)).toBe(true);
	});
});
