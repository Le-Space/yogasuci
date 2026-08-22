import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * The app as it comes up, signed in as `did`.
 *
 * Modules are reset rather than a cache being cleared by hand: what is claimed
 * below is that a key survives a *reload*, and `forgetDeviceKeys` deliberately
 * throws the stored key away too. Reaching for it here would have tested the
 * wrong thing — it did, and the tests failed until this replaced it. Storage is
 * a global and is left standing, which is exactly what a reload does.
 */
async function boot(/** @type {string} */ did) {
	vi.resetModules();

	const account = await import('../identity/account.js');
	const keys = await import('./device-keys.js');

	account.setActiveAccount(did);
	return keys;
}

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe('this device’s encryption key', () => {
	it('is the same one after a reload', async () => {
		const first = await (await boot(STUDIO)).ownDeviceKeys();
		const again = await (await boot(STUDIO)).ownDeviceKeys();

		expect(again.publicKey).toBe(first.publicKey);
	});

	it('publishes something another device can import', async () => {
		// The whole point of the pair: somebody who has never met this device can
		// wrap a key for it from what the registry carries.
		const keys = await boot(STUDIO);
		const { publicKey } = await keys.ownDeviceKeys();

		const imported = await keys.importDeviceKey(publicKey);

		expect(imported.type).toBe('public');
		expect(imported.algorithm.name).toBe('ECDH');
	});

	it('does not publish the half that opens things', async () => {
		// A private key in a registry entry would be the whole failure in one line,
		// so this reads the published string rather than trusting the caller.
		const { publicKey } = await (await boot(STUDIO)).ownDeviceKeys();

		const jwk = JSON.parse(atob(publicKey));
		expect(jwk.d).toBeUndefined();
		expect(jwk.crv).toBe('P-256');
	});

	it('agrees on a shared secret with another device', async () => {
		// Not a test of WebCrypto but of the pair being usable for what it exists
		// for: two devices reaching the same bytes without exchanging a secret.
		const studioKeys = await boot(STUDIO);
		const studio = await studioKeys.ownDeviceKeys();

		const studentKeys = await boot(STUDENT);
		const student = await studentKeys.ownDeviceKeys();

		const atStudent = await crypto.subtle.deriveBits(
			{ name: 'ECDH', public: await studentKeys.importDeviceKey(studio.publicKey) },
			student.privateKey,
			256
		);

		const back = await boot(STUDIO);
		const atStudio = await crypto.subtle.deriveBits(
			{ name: 'ECDH', public: await back.importDeviceKey(student.publicKey) },
			(await back.ownDeviceKeys()).privateKey,
			256
		);

		expect(new Uint8Array(atStudent)).toEqual(new Uint8Array(atStudio));
	});

	it('is forgotten when asked, and a new one is made', async () => {
		const keys = await boot(STUDIO);
		const first = await keys.ownDeviceKeys();

		keys.forgetDeviceKeys();

		expect((await keys.ownDeviceKeys()).publicKey).not.toBe(first.publicKey);
	});
});

describe('two passkeys on one device', () => {
	it('get different key pairs', async () => {
		const studio = await (await boot(STUDIO)).ownDeviceKeys();
		const student = await (await boot(STUDENT)).ownDeviceKeys();

		expect(student.publicKey).not.toBe(studio.publicKey);
	});

	it('keep their own after switching back', async () => {
		const studio = await (await boot(STUDIO)).ownDeviceKeys();
		await (await boot(STUDENT)).ownDeviceKeys();

		expect((await (await boot(STUDIO)).ownDeviceKeys()).publicKey).toBe(studio.publicKey);
	});
});
