import { describe, expect, it } from 'vitest';

import { newKey, sealer } from './encryption.js';

const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text);
const text = (/** @type {Uint8Array} */ value) => new TextDecoder().decode(value);

describe('sealing a payload', () => {
	it('gives back what went in', async () => {
		const seal = await sealer(newKey());
		const sealed = await seal.seal(bytes('Vinyasa, Freitag 19:30'));

		expect(text(await seal.open(sealed))).toBe('Vinyasa, Freitag 19:30');
	});

	it('does not leave the payload legible', async () => {
		const seal = await sealer(newKey());
		const sealed = await seal.seal(bytes('Vinyasa, Freitag 19:30'));

		expect(text(sealed)).not.toContain('Vinyasa');
	});

	it('uses a different nonce every time', async () => {
		// The reason this module exists rather than `@orbitdb/simple-encryption`,
		// which reuses one nonce for 32 000 messages. Under AES-GCM that discloses
		// the XOR of the plaintexts and allows entries to be forged, so this is the
		// assertion the whole file is for.
		const seal = await sealer(newKey());

		const nonces = new Set();
		for (let i = 0; i < 50; i++) {
			const sealed = await seal.seal(bytes(`booking ${i}`));
			nonces.add(text(sealed.subarray(0, 12)));
		}

		expect(nonces.size).toBe(50);
	});

	it('never produces the same bytes twice for the same text', async () => {
		// Follows from the nonce, and worth pinning separately: identical output for
		// identical input would tell a reader that two students booked the same
		// class without decrypting anything.
		const seal = await sealer(newKey());
		const once = await seal.seal(bytes('Vinyasa'));
		const twice = await seal.seal(bytes('Vinyasa'));

		expect(text(once)).not.toBe(text(twice));
	});
});

describe('a payload somebody must not read', () => {
	it('stays shut for a different key', async () => {
		const mine = await sealer(newKey());
		const theirs = await sealer(newKey());
		const sealed = await mine.seal(bytes('Vinyasa, Freitag 19:30'));

		await expect(theirs.open(sealed)).rejects.toThrow();
	});

	it('refuses bytes that were altered', async () => {
		// GCM authenticates as well as encrypts, and the throw is the feature: a
		// caller that got nothing back instead would write an empty booking rather
		// than report a problem.
		const seal = await sealer(newKey());
		const sealed = await seal.seal(bytes('Vinyasa, Freitag 19:30'));
		sealed[sealed.length - 1] ^= 0xff;

		await expect(seal.open(sealed)).rejects.toThrow();
	});

	it('refuses something that was never sealed', async () => {
		const seal = await sealer(newKey());

		await expect(seal.open(bytes('plain text'))).rejects.toThrow();
	});
});

describe('the key', () => {
	it('is refused when it is the wrong size', async () => {
		await expect(sealer(new Uint8Array(16))).rejects.toThrow();
		await expect(sealer(/** @type {any} */ ('a string'))).rejects.toThrow();
	});

	it('is different every time one is made', () => {
		expect(text(newKey())).not.toBe(text(newKey()));
	});
});
