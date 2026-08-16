import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	activeAccount,
	clearActiveAccount,
	legacyAccount,
	scoped,
	setActiveAccount
} from './account.js';

const STUDIO = 'did:key:zStudio';
const STUDENT = 'did:key:zStudent';

/** localStorage as the module sees it, with no browser in the room. */
function fakeStorage(seed = {}) {
	/** @type {Record<string, string>} */
	const store = { ...seed };

	return {
		getItem: (/** @type {string} */ key) => store[key] ?? null,
		setItem: (/** @type {string} */ key, /** @type {string} */ value) => {
			store[key] = value;
		},
		removeItem: (/** @type {string} */ key) => {
			delete store[key];
		}
	};
}

beforeEach(() => {
	clearActiveAccount();
});

afterEach(() => {
	clearActiveAccount();
});

describe('a device that has only ever had one passkey', () => {
	beforeEach(() => {
		// The evidence of a pre-account install: its own studio's addresses.
		globalThis.localStorage = /** @type {any} */ (
			fakeStorage({ 'yoga-p2p.databases': '{"registry":"/orbitdb/abc"}' })
		);
	});

	it('keeps the names its data is already under', () => {
		setActiveAccount(STUDIO);

		expect(scoped('yoga-p2p.databases')).toBe('yoga-p2p.databases');
		expect(scoped('yoga-p2p/blocks')).toBe('yoga-p2p/blocks');
	});

	it('still holds those names after a reload', () => {
		setActiveAccount(STUDIO);
		clearActiveAccount();
		setActiveAccount(STUDIO);

		expect(legacyAccount()).toBe(STUDIO);
		expect(scoped('yoga-p2p.databases')).toBe('yoga-p2p.databases');
	});
});

describe('a second passkey on that same device', () => {
	beforeEach(() => {
		globalThis.localStorage = /** @type {any} */ (
			fakeStorage({ 'yoga-p2p.databases': '{"registry":"/orbitdb/abc"}' })
		);
		setActiveAccount(STUDIO);
	});

	it('gets names of its own', () => {
		setActiveAccount(STUDENT);

		expect(scoped('yoga-p2p.databases')).toBe(`yoga-p2p.databases:${STUDENT}`);
		expect(scoped('yoga-p2p/blocks')).toBe(`yoga-p2p/blocks:${STUDENT}`);
	});

	it('does not take the first account’s data with it', () => {
		// The bug this file exists for: signing in as the student must not leave
		// the studio's addresses in reach, or its registry is opened as "own" and
		// the owner check answers no on the device that created it.
		setActiveAccount(STUDENT);

		expect(scoped('yoga-p2p.databases')).not.toBe(scoped('yoga-p2p.databases', STUDIO));
	});

	it('gives the first account its names back when it signs in again', () => {
		setActiveAccount(STUDENT);
		setActiveAccount(STUDIO);

		expect(scoped('yoga-p2p.databases')).toBe('yoga-p2p.databases');
	});
});

describe('a device installed after accounts existed', () => {
	beforeEach(() => {
		// Nothing to adopt.
		globalThis.localStorage = /** @type {any} */ (fakeStorage());
	});

	it('suffixes every account, including the first', () => {
		// Otherwise one account per device would be permanently unlike the others
		// for no reason anybody could see.
		setActiveAccount(STUDIO);

		expect(legacyAccount()).toBe(null);
		expect(scoped('yoga-p2p.databases')).toBe(`yoga-p2p.databases:${STUDIO}`);
	});

	it('keeps two accounts apart', () => {
		setActiveAccount(STUDIO);
		const studio = scoped('yoga-p2p/blocks');

		setActiveAccount(STUDENT);

		expect(scoped('yoga-p2p/blocks')).not.toBe(studio);
	});
});

describe('before anybody has signed in', () => {
	beforeEach(() => {
		globalThis.localStorage = /** @type {any} */ (fakeStorage());
	});

	it('refuses to name anything', () => {
		// Returning the bare name would be the old behaviour, which is the bug:
		// whoever asked would read the previous account's data.
		expect(activeAccount()).toBe(null);
		expect(() => scoped('yoga-p2p.databases')).toThrow();
	});
});
