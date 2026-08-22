import * as dagCbor from '@ipld/dag-cbor';
import * as Block from 'multiformats/block';
import { sha256 } from 'multiformats/hashes/sha2';
import { describe, expect, it } from 'vitest';

import { newKey } from './encryption.js';
import { payloadEncryption } from './entry-encryption.js';

/** What OrbitDB hands to `encrypt`: the payload, dag-cbor encoded. */
async function encoded(/** @type {any} */ value) {
	const block = await Block.encode({ value, codec: dagCbor, hasher: sha256 });
	return block.bytes;
}

/** What OrbitDB does with whatever `decrypt` returns. */
async function decoded(/** @type {any} */ bytes) {
	const block = await Block.decode({ bytes, codec: dagCbor, hasher: sha256 });
	return block.value;
}

const booking = {
	op: 'PUT',
	key: 'booking:1',
	value: { course: 'course:vinyasa', state: 'confirmed' }
};

describe('an entry written under encryption', () => {
	it('comes back as the document that went in', async () => {
		const { data } = await payloadEncryption(newKey());

		const sealed = await data.encrypt(await encoded(booking));

		expect(await decoded(await data.decrypt(sealed))).toEqual(booking);
	});

	it('does not carry the document in the clear', async () => {
		const { data } = await payloadEncryption(newKey());

		const sealed = await data.encrypt(await encoded(booking));

		expect(new TextDecoder().decode(sealed)).not.toContain('vinyasa');
	});

	it('is refused by a database key that is not the right one', async () => {
		const mine = await payloadEncryption(newKey());
		const theirs = await payloadEncryption(newKey());

		const sealed = await mine.data.encrypt(await encoded(booking));

		await expect(theirs.data.decrypt(sealed)).rejects.toThrow();
	});
});

describe('an entry written before this database was encrypted', () => {
	it('is still readable', async () => {
		// The case that decides whether switching encryption on is a migration or a
		// data loss. Encryption is not part of an OrbitDB manifest, so the address
		// does not change and every booking a studio already took stays in place —
		// as a decoded document rather than as bytes, which is what OrbitDB hands
		// over here.
		const { data } = await payloadEncryption(newKey());

		expect(await decoded(await data.decrypt(booking))).toEqual(booking);
	});

	it('is readable beside entries that were sealed', async () => {
		// The real shape of a database mid-migration: old plaintext, new sealed.
		const { data } = await payloadEncryption(newKey());
		const sealed = await data.encrypt(await encoded({ ...booking, key: 'booking:2' }));

		expect(await decoded(await data.decrypt(booking))).toEqual(booking);
		expect(await decoded(await data.decrypt(sealed))).toEqual({ ...booking, key: 'booking:2' });
	});
});
