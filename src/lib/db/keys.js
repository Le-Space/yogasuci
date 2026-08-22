// Where a device keeps the keys it can already open.
//
// One key per encrypted database, held per account: two passkeys on one device
// are two separate accounts with separate storage (#82), and a key is exactly
// the sort of thing that must not leak across them.
//
// Deliberately not the whole answer. A key gets here in one of two ways — this
// device made it, or it unwrapped one addressed to it — and only the first
// exists so far (#95 phase 2). The store is the same either way, which is why it
// is worth having before the sharing is built: what changes later is where a key
// comes from, not where it lives.
//
// Kept free of OrbitDB and Svelte so the rule about which account may read which
// key is provable without a browser.

import { scoped } from '../identity/account.js';
import { newKey } from './encryption.js';

const STORAGE_KEY = 'yoga-p2p.dbkeys';

/** @returns {Record<string, string>} database name → base64 key */
function stored() {
	try {
		return JSON.parse(localStorage.getItem(scoped(STORAGE_KEY)) ?? '{}');
	} catch {
		// Storage denied, or something else wrote here. Treated as "no keys", which
		// means an encrypted database stays shut rather than being written to with a
		// fresh key that nobody else has.
		return {};
	}
}

/** @param {Uint8Array} key */
function encode(key) {
	return btoa(String.fromCharCode(...key));
}

/** @param {string} value */
function decode(value) {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/**
 * The key for a database, or null when this account holds none.
 *
 * Null rather than a fresh key on purpose: making one up would produce a
 * database only this device can read, silently, which is worse than not opening
 * it.
 *
 * @param {string} name
 * @returns {Uint8Array | null}
 */
export function keyFor(name) {
	const value = stored()[name];
	return value ? decode(value) : null;
}

/**
 * Keep a key this account may use.
 *
 * @param {string} name
 * @param {Uint8Array} key
 */
export function rememberKey(name, key) {
	try {
		localStorage.setItem(scoped(STORAGE_KEY), JSON.stringify({ ...stored(), [name]: encode(key) }));
	} catch {
		// This session can still read and write; the next one starts without it.
	}
}

/**
 * The key for a database this device is creating.
 *
 * Separate from `keyFor` because creating one is a decision: it makes data that
 * nobody else can read until the key has been shared, and that must be the
 * caller's intent rather than a fallback.
 *
 * @param {string} name
 */
export function createKeyFor(name) {
	const existing = keyFor(name);
	if (existing) return existing;

	const key = newKey();
	rememberKey(name, key);
	return key;
}

/** @param {string} name */
export function forgetKey(name) {
	const keys = stored();
	delete keys[name];

	try {
		localStorage.setItem(scoped(STORAGE_KEY), JSON.stringify(keys));
	} catch {
		// nothing to clean up
	}
}
