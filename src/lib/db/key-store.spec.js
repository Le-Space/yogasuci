import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage() {
	const values = new Map();
	return {
		getItem: (/** @type {string} */ key) => (values.has(key) ? values.get(key) : null),
		setItem: (/** @type {string} */ key, /** @type {string} */ value) => values.set(key, value),
		removeItem: (/** @type {string} */ key) => values.delete(key)
	};
}

/** An OrbitDB documents store, reduced to what these two functions touch. */
function fakeStore() {
	const documents = new Map();
	return {
		documents,
		async put(/** @type {any} */ document) {
			documents.set(document._id, document);
		},
		async get(/** @type {string} */ id) {
			return documents.has(id) ? { value: documents.get(id) } : null;
		}
	};
}

/**
 * The modules as they come up for one account.
 *
 * Nothing from `p2p/node.js` is imported, which is the point of `claimKey`
 * taking the DID rather than reading a store: that import reaches libp2p and a
 * native module node does not have, and the first version of this file failed
 * on exactly that.
 */
async function boot(/** @type {string} */ did) {
	// Storage is deliberately *not* replaced here. It stands for the browser's,
	// which survives a reload and is separated per account by `scoped()` — and
	// replacing it per boot is how the first version of this test made a device
	// arrive with a new key pair, so the copy sealed to its old one no longer
	// opened. The failure looked cryptographic and was a test that threw the
	// device's identity away between two lines.
	vi.resetModules();

	const account = await import('../identity/account.js');
	const deviceKeys = await import('./device-keys.js');
	const keyStore = await import('./key-store.js');

	account.setActiveAccount(did);

	return { ...keyStore, ...deviceKeys, published: (await deviceKeys.ownDeviceKeys()).publicKey };
}

const STUDENT = 'did:key:zStudent';
const COUNTER = 'did:key:zCounter';
const BOOKINGS = 'yoga-bookings-did:key:zStudent';

const same = (/** @type {Uint8Array} */ a, /** @type {Uint8Array} */ b) =>
	[...a].join(',') === [...b].join(',');

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
});

describe('leaving a key for somebody', () => {
	it('reaches the device it was left for', async () => {
		// The whole path in one test: a counter publishes a key, a student seals a
		// database key to it and leaves the copy in their own store, and the
		// counter opens it later without the two having exchanged anything else.
		const counter = await boot(COUNTER);
		const counterKey = counter.published;

		const student = await boot(STUDENT);
		const { newKey } = await import('./encryption.js');
		const databaseKey = newKey();
		const store = fakeStore();

		await student.shareKey({
			store,
			databaseName: BOOKINGS,
			recipientDid: COUNTER,
			recipientPublicKey: counterKey,
			databaseKey
		});

		const atCounter = await boot(COUNTER);
		const claimed = await atCounter.claimKey({ store, databaseName: BOOKINGS, ownDid: COUNTER });

		expect(claimed).not.toBe(null);
		expect(same(/** @type {Uint8Array} */ (claimed), databaseKey)).toBe(true);
	});

	it('says nothing to a device it was not left for', async () => {
		const counter = await boot(COUNTER);
		const counterKey = counter.published;

		const student = await boot(STUDENT);
		const { newKey } = await import('./encryption.js');
		const store = fakeStore();

		await student.shareKey({
			store,
			databaseName: BOOKINGS,
			recipientDid: COUNTER,
			recipientPublicKey: counterKey,
			databaseKey: newKey()
		});

		// A third device replicates the same store and finds nothing addressed to
		// it — which is why this database does not have to be encrypted itself.
		const stranger = await boot('did:key:zStranger');
		expect(
			await stranger.claimKey({ store, databaseName: BOOKINGS, ownDid: 'did:key:zStranger' })
		).toBe(null);
	});

	it('keeps one copy per recipient and database', async () => {
		const counter = await boot(COUNTER);
		const counterKey = counter.published;
		const student = await boot(STUDENT);
		const { newKey } = await import('./encryption.js');
		const store = fakeStore();

		for (const databaseName of [BOOKINGS, 'yoga-tickets-did:key:zStudent']) {
			await student.shareKey({
				store,
				databaseName,
				recipientDid: COUNTER,
				recipientPublicKey: counterKey,
				databaseKey: newKey()
			});
		}

		expect(store.documents.size).toBe(2);
	});

	it('refuses to seal for a device that has published nothing', async () => {
		// Skipping it quietly is how somebody ends up unable to read a database
		// everyone assumes they can, with nothing recorded about when it went wrong.
		const student = await boot(STUDENT);
		const { newKey } = await import('./encryption.js');

		await expect(
			student.shareKey({
				store: fakeStore(),
				databaseName: BOOKINGS,
				recipientDid: COUNTER,
				recipientPublicKey: '',
				databaseKey: newKey()
			})
		).rejects.toThrow(/No published key/);
	});
});

describe('the name of a key store', () => {
	it('follows from the DID, so nobody has to be told an address', async () => {
		const { keyStoreName } = await boot(STUDENT);

		expect(keyStoreName(STUDENT)).toBe('yoga-keys-did:key:zStudent');
	});
});
