// The key pair a device can be written to.
//
// A passkey cannot do this. A WebAuthn credential signs and nothing else — it
// has no operation for decryption or key agreement — so "encrypt to the device's
// DID" does not work even though a `did:key` carries a public key. And the PRF
// extension is no substitute: its output belongs to one credential, so two
// passkeys on one phone derive two different secrets and could not read each
// other's data. Multiple studio devices are the normal case, not the edge one
// (#95).
//
// So every device makes a second key pair, for encryption only, and publishes
// the public half. Anyone who can read the registry can then wrap a database key
// for that device without ever meeting it.
//
// P-256 because it is what WebCrypto offers for ECDH everywhere this app runs,
// and because it is already the curve the identity uses — one fewer primitive in
// the app for somebody to reason about.

import { scoped } from '../identity/account.js';

const STORAGE_KEY = 'yoga-p2p.devicekey';
const CURVE = { name: 'ECDH', namedCurve: 'P-256' };

/**
 * @typedef {object} DeviceKeyPair
 * @property {CryptoKey} privateKey for unwrapping keys addressed to this device
 * @property {string} publicKey base64url JWK, the half that goes into the registry
 */

/** @type {DeviceKeyPair | null} */
let cached = null;

/**
 * This device's encryption key pair, made once and kept.
 *
 * Per account rather than per device, like every other secret here: two
 * passkeys on one phone are two accounts, and one must not be able to open what
 * the other was sent (#82).
 *
 * The private half is stored as an exported JWK. That is worth being plain
 * about: it is as exposed as anything else in this browser's storage, no better
 * protected than the database keys it will unwrap. Binding it to the passkey
 * would be a real improvement and is not this change.
 *
 * @returns {Promise<DeviceKeyPair>}
 */
export async function ownDeviceKeys() {
	if (cached) return cached;

	const stored = read();
	if (stored) {
		cached = {
			privateKey: await crypto.subtle.importKey('jwk', stored.privateKey, CURVE, true, [
				'deriveKey',
				'deriveBits'
			]),
			publicKey: stored.publicKey
		};
		return cached;
	}

	const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveKey', 'deriveBits']);
	const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
	const publicKey = encode(await crypto.subtle.exportKey('jwk', pair.publicKey));

	write({ privateKey, publicKey });

	cached = { privateKey: pair.privateKey, publicKey };
	return cached;
}

/**
 * Read somebody else's published key.
 *
 * @param {string} value the string a registry entry or an introduction carried
 * @returns {Promise<CryptoKey>}
 */
export async function importDeviceKey(value) {
	return crypto.subtle.importKey('jwk', decode(value), CURVE, true, []);
}

/** For tests, and for a sign-out that must not leave the next account this key. */
export function forgetDeviceKeys() {
	cached = null;

	try {
		localStorage.removeItem(scoped(STORAGE_KEY));
	} catch {
		// nothing to clean up
	}
}

/** @param {any} jwk */
function encode(jwk) {
	return btoa(JSON.stringify(jwk));
}

/** @param {string} value */
function decode(value) {
	return JSON.parse(atob(value));
}

/** @returns {{ privateKey: any, publicKey: string } | null} */
function read() {
	try {
		const raw = localStorage.getItem(scoped(STORAGE_KEY));
		return raw ? JSON.parse(raw) : null;
	} catch {
		// Storage denied, or somebody else wrote here. A new pair is made instead,
		// which costs this device the keys already wrapped for its old one — it has
		// to be sent them again. Better than throwing on a screen nobody can fix.
		return null;
	}
}

/** @param {{ privateKey: any, publicKey: string }} value */
function write(value) {
	try {
		localStorage.setItem(scoped(STORAGE_KEY), JSON.stringify(value));
	} catch {
		// As above: this session works, the next one starts over.
	}
}
