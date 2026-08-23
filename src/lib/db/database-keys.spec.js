import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage() {
	const values = new Map();
	return {
		getItem: (/** @type {string} */ key) => (values.has(key) ? values.get(key) : null),
		setItem: (/** @type {string} */ key, /** @type {string} */ value) => values.set(key, value),
		removeItem: (/** @type {string} */ key) => values.delete(key)
	};
}

/** An OrbitDB documents store, reduced to what the key store touches. */
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
 * Storage is stubbed once per test and *not* replaced per boot: it stands for
 * the browser's, which survives a reload and is separated per account by
 * `scoped()`. Replacing it here would give a device a new key pair each time,
 * and copies sealed to its old one would stop opening.
 */
async function boot(/** @type {string} */ did) {
	vi.resetModules();

	const account = await import('../identity/account.js');
	const deviceKeys = await import('./device-keys.js');
	const databaseKeys = await import('./database-keys.js');

	account.setActiveAccount(did);

	return { ...databaseKeys, published: (await deviceKeys.ownDeviceKeys()).publicKey };
}

const STUDENT = 'did:key:zStudent';
const COUNTER = 'did:key:zCounter';
const BOOKINGS = 'yoga-bookings-did:key:zStudent';

const same = (/** @type {any} */ a, /** @type {any} */ b) => [...a].join(',') === [...b].join(',');

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
});

describe('the device that owns a database', () => {
	it('makes the key and is ready at once', async () => {
		const student = await boot(STUDENT);

		const outcome = await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: fakeStore()
		});

		expect(outcome.state).toBe('ready');
		expect(outcome.key).toBeInstanceOf(Uint8Array);
	});

	it('makes it once, not once per open', async () => {
		// A second key for the same database is the same silent fork as inventing
		// one: entries written under it are unreadable to everyone who has the first.
		const student = await boot(STUDENT);
		const store = fakeStore();

		const first = await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store
		});
		const second = await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store
		});

		expect(same(first.key, second.key)).toBe(true);
	});

	it('leaves a copy for every holder but itself', async () => {
		const counter = await boot(COUNTER);
		const counterKey = counter.published;
		const student = await boot(STUDENT);
		const store = fakeStore();

		await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store,
			holders: [
				{ did: COUNTER, encryptionKey: counterKey },
				{ did: STUDENT, encryptionKey: student.published }
			]
		});

		expect([...store.documents.keys()]).toEqual([`key:${BOOKINGS}:${COUNTER}`]);
	});

	it('names a holder it could not seal for, and still serves the others', async () => {
		// A device registered before it published a key. Stopping here would leave
		// everyone else without the key because of one straggler.
		const counter = await boot(COUNTER);
		const counterKey = counter.published;
		const student = await boot(STUDENT);
		const store = fakeStore();

		const outcome = await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store,
			holders: [
				{ did: COUNTER, encryptionKey: counterKey },
				{ did: 'did:key:zSilent', encryptionKey: '' }
			]
		});

		expect(outcome.state).toBe('ready');
		expect(outcome.unreachable).toEqual(['did:key:zSilent']);
		expect(store.documents.size).toBe(1);
	});

	it('gives a device approved later its copy on the next open', async () => {
		// Nobody presses anything: the holder set is read again each time, so a
		// counter approved this morning is served without a fresh decision.
		const student = await boot(STUDENT);
		const store = fakeStore();
		await student.obtainKey({ name: BOOKINGS, ownDid: STUDENT, isSharer: true, ownStore: store });

		const counter = await boot(COUNTER);
		const counterKey = counter.published;

		const again = await boot(STUDENT);
		await again.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store,
			holders: [{ did: COUNTER, encryptionKey: counterKey }]
		});

		expect(store.documents.has(`key:${BOOKINGS}:${COUNTER}`)).toBe(true);
	});
});

describe('a device that may read but does not own', () => {
	it('waits rather than inventing a key', async () => {
		// The whole point of this module. Inventing one opens the database, writes
		// entries nobody else can read, and reports nothing — the data forks in
		// silence and both halves look healthy.
		const counter = await boot(COUNTER);

		const outcome = await counter.obtainKey({
			name: BOOKINGS,
			ownDid: COUNTER,
			isSharer: false,
			sharerStore: fakeStore()
		});

		expect(outcome.state).toBe('waiting');
		expect(outcome.key).toBe(null);
	});

	it('waits when the sharer’s store has not arrived at all', async () => {
		const counter = await boot(COUNTER);

		const outcome = await counter.obtainKey({
			name: BOOKINGS,
			ownDid: COUNTER,
			isSharer: false
		});

		expect(outcome.state).toBe('waiting');
	});

	it('takes the copy left for it', async () => {
		const counter = await boot(COUNTER);
		const counterKey = counter.published;
		const student = await boot(STUDENT);
		const store = fakeStore();

		const shared = await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store,
			holders: [{ did: COUNTER, encryptionKey: counterKey }]
		});

		const atCounter = await boot(COUNTER);
		const outcome = await atCounter.obtainKey({
			name: BOOKINGS,
			ownDid: COUNTER,
			isSharer: false,
			sharerStore: store
		});

		expect(outcome.state).toBe('ready');
		expect(same(outcome.key, shared.key)).toBe(true);
	});

	it('keeps it, so a later open does not depend on replication', async () => {
		const counter = await boot(COUNTER);
		const counterKey = counter.published;
		const student = await boot(STUDENT);
		const store = fakeStore();
		await student.obtainKey({
			name: BOOKINGS,
			ownDid: STUDENT,
			isSharer: true,
			ownStore: store,
			holders: [{ did: COUNTER, encryptionKey: counterKey }]
		});

		const atCounter = await boot(COUNTER);
		const first = await atCounter.obtainKey({
			name: BOOKINGS,
			ownDid: COUNTER,
			isSharer: false,
			sharerStore: store
		});

		// The store goes away — a connection dropped, the sharer walked out.
		const later = await boot(COUNTER);
		const second = await later.obtainKey({ name: BOOKINGS, ownDid: COUNTER, isSharer: false });

		expect(second.state).toBe('ready');
		expect(same(second.key, first.key)).toBe(true);
	});
});
