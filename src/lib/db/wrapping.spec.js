import { describe, expect, it, vi } from 'vitest';

import { newKey } from './encryption.js';
import { unwrapKey, wrapKey } from './wrapping.js';

function fakeStorage() {
	const values = new Map();
	return {
		getItem: (/** @type {string} */ key) => (values.has(key) ? values.get(key) : null),
		setItem: (/** @type {string} */ key, /** @type {string} */ value) => values.set(key, value),
		removeItem: (/** @type {string} */ key) => values.delete(key)
	};
}

/** A device with a published key, as ./device-keys.js makes one. */
async function device(/** @type {string} */ did) {
	vi.resetModules();
	vi.stubGlobal('localStorage', fakeStorage());

	const account = await import('../identity/account.js');
	const keys = await import('./device-keys.js');
	account.setActiveAccount(did);

	const own = await keys.ownDeviceKeys();
	return { ...own, imported: await keys.importDeviceKey(own.publicKey) };
}

const same = (/** @type {Uint8Array} */ a, /** @type {Uint8Array} */ b) =>
	[...a].join(',') === [...b].join(',');

describe('handing a database key to somebody', () => {
	it('arrives as the key that was sent', async () => {
		const counter = await device('did:key:zCounter');
		const key = newKey();

		const copy = await wrapKey(key, counter.imported);

		expect(same(await unwrapKey(copy, counter.privateKey), key)).toBe(true);
	});

	it('does not travel in the clear', async () => {
		const counter = await device('did:key:zCounter');
		const key = newKey();

		const copy = await wrapKey(key, counter.imported);

		expect(copy.wrapped).not.toContain(btoa(String.fromCharCode(...key)).slice(0, 12));
	});

	it('is sealed to one recipient and nobody else', async () => {
		// The property the whole scheme rests on: a copy addressed to the counter
		// tells a student's phone nothing, even though both replicate it.
		const counter = await device('did:key:zCounter');
		const student = await device('did:key:zStudent');
		const key = newKey();

		const forCounter = await wrapKey(key, counter.imported);

		await expect(unwrapKey(forCounter, student.privateKey)).rejects.toThrow();
	});

	it('can be addressed to a device that is not here', async () => {
		// Why the published key exists at all: a studio approves a phone that left
		// an hour ago, and a ledger key has to reach a counter nobody has met.
		// Nothing in this call needs the recipient to take part.
		const absent = await device('did:key:zAbsent');
		const key = newKey();

		const copy = await wrapKey(key, absent.imported);

		expect(same(await unwrapKey(copy, absent.privateKey), key)).toBe(true);
	});

	it('seals the same key differently every time', async () => {
		// Two counters getting one database key must not produce two identical
		// records, or the store would say who shares what without opening anything.
		const counter = await device('did:key:zCounter');
		const key = newKey();

		const once = await wrapKey(key, counter.imported);
		const twice = await wrapKey(key, counter.imported);

		expect(once.wrapped).not.toBe(twice.wrapped);
		expect(once.ephemeral).not.toBe(twice.ephemeral);
	});

	it('refuses a copy that was altered', async () => {
		const counter = await device('did:key:zCounter');
		const copy = await wrapKey(newKey(), counter.imported);

		const bytes = Uint8Array.from(atob(copy.wrapped), (c) => c.charCodeAt(0));
		bytes[bytes.length - 1] ^= 0xff;

		await expect(
			unwrapKey({ ...copy, wrapped: btoa(String.fromCharCode(...bytes)) }, counter.privateKey)
		).rejects.toThrow();
	});

	it('refuses a copy whose sender key was swapped', async () => {
		// Replacing the ephemeral half is the obvious thing to try: it would make
		// both sides derive different secrets, and GCM says so rather than
		// returning something plausible.
		const counter = await device('did:key:zCounter');
		const other = await device('did:key:zOther');

		const copy = await wrapKey(newKey(), counter.imported);
		const swapped = await wrapKey(newKey(), other.imported);

		await expect(
			unwrapKey({ ...copy, ephemeral: swapped.ephemeral }, counter.privateKey)
		).rejects.toThrow();
	});
});
