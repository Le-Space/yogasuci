// Opening a database that is sealed, or saying that it cannot be opened yet.
//
// Everything underneath this is decided elsewhere: the cryptography in
// ./encryption.js, where a key comes from in ./database-keys.js, where copies
// live in ./key-store.js. What is left here is the join — and one rule that has
// to hold at every call site, which is why they all go through this function
// rather than each assembling it:
//
//   a database whose key has not arrived is NOT opened.
//
// The alternative is worse than an empty screen. Opening it without the key
// would let this device write entries in the clear beside sealed ones, or under
// a key of its own making, and both look like success. Nobody would learn about
// it until somebody could not read their own bookings — by which time the data
// has two halves and both are real.
//
// So a caller gets null, `waitingForKeys` names the database, and the screen
// says the thing is on its way rather than that it is empty (#95).

import { get, writable } from 'svelte/store';

import { ownDidStore } from '../p2p/node.js';
import { obtainKey } from './database-keys.js';
import { payloadEncryption } from './entry-encryption.js';
import { openDocuments } from './open.js';
import { openKeyStoreOf, openOwnKeyStore } from './open-key-stores.js';

/**
 * The databases this device may read but has no key for yet.
 *
 * A set of names rather than a flag: a counter can be waiting for one student's
 * ledger while reading another's, and "something is waiting" would be useless
 * for saying which.
 *
 * @type {import('svelte/store').Writable<Set<string>>}
 */
export const waitingForKeys = writable(new Set());

/** @param {string} name @param {boolean} waiting */
function note(name, waiting) {
	waitingForKeys.update((current) => {
		const next = new Set(current);
		if (waiting) next.add(name);
		else next.delete(name);
		return next;
	});
}

/**
 * Open an encrypted database, or report that its key has not arrived.
 *
 * @param {object} options
 * @param {string} options.key how this database is remembered locally
 * @param {string} options.name
 * @param {string} [options.address]
 * @param {any} [options.accessController]
 * @param {string} options.sharerDid whose key store holds the copies for this
 *   database — the person who owns it, which is not always who opens it
 * @param {import('./database-keys.js').Holder[]} [options.holders] who should be
 *   able to read; only consulted when this device is the sharer
 * @param {(db: any) => void | Promise<void>} [options.onLater] called if the key
 *   turns up afterwards, with the database this function could not return
 * @returns {Promise<any | null>} null when the key is not here yet
 */
export async function openEncrypted({
	key,
	name,
	address,
	accessController,
	sharerDid,
	holders = [],
	onLater
}) {
	const own = get(ownDidStore);
	if (!own) throw new Error('This device has no identity yet.');

	const isSharer = sharerDid === own;

	// Only what is needed: the sharer writes copies and never reads them, and a
	// reader has no business opening its own store for this.
	const ownStore = isSharer ? await openOwnKeyStore() : null;
	const sharerStore = isSharer ? null : await openKeyStoreOf(sharerDid).catch(() => null);

	const outcome = await obtainKey({ name, ownDid: own, isSharer, ownStore, sharerStore, holders });

	if (outcome.state === 'waiting' || !outcome.key) {
		note(name, true);

		// Waiting is normal and usually brief, and it must not be permanent. A
		// studio opens a student's bookings the moment that student introduces
		// itself — before the student has seen the registry, so before it knows who
		// to seal a key for. The copy arrives seconds later, and without this
		// nothing would ever look again: the counter would sit in front of a
		// database it may read, holding a key that is lying in a store it has
		// already replicated.
		//
		// Driven by the store's own update rather than by a timer, so it costs
		// nothing while nothing happens.
		if (sharerStore && onLater)
			watchFor({ sharerStore, key, name, address, accessController, sharerDid, onLater });

		return null;
	}

	if (outcome.unreachable?.length) {
		// Named rather than swallowed: these devices will not be able to read until
		// they publish a key and somebody opens this database again.
		console.warn(`No key could be sealed for: ${outcome.unreachable.join(', ')}`);
	}

	const db = await openDocuments({
		key,
		name,
		address,
		accessController,
		encryption: await payloadEncryption(outcome.key)
	});

	note(name, false);
	return db;
}

/** For a sign-out, so the next account does not inherit somebody else's wait. */
export function clearWaitingForKeys() {
	waitingForKeys.set(new Set());
}

/**
 * Look again each time the sharer's store changes, until the copy is there.
 *
 * Detaches itself once it succeeds. A device that never receives a copy keeps a
 * listener on a database it is replicating anyway, which is cheap and honest —
 * the alternative is giving up on a key that may still be coming.
 *
 * @param {object} options
 * @param {any} options.sharerStore
 * @param {string} options.key
 * @param {string} options.name
 * @param {string} [options.address]
 * @param {any} [options.accessController]
 * @param {string} options.sharerDid
 * @param {(db: any) => void | Promise<void>} options.onLater
 */
function watchFor({ sharerStore, key, name, address, accessController, sharerDid, onLater }) {
	const retry = async () => {
		try {
			const db = await openEncrypted({ key, name, address, accessController, sharerDid });
			if (!db) return;

			sharerStore.events?.off?.('update', retry);
			await onLater(db);
		} catch (error) {
			console.warn(`Could not open ${name} after its key arrived:`, error);
		}
	};

	sharerStore.events?.on?.('update', retry);
}
