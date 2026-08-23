// Where the key for one database comes from, and what happens when it has not
// arrived yet.
//
// Three ways a device can hold the key to an encrypted database, and they are
// not interchangeable:
//
//   it made it        — the person who owns the database creates the key once
//                       and shares it with everyone who may read
//   it was given one  — a copy sealed to this device, left in the sharer's key
//                       store (./key-store.js)
//   it has none yet   — the copy is on its way, or was never made
//
// The third is the case worth designing for, because the tempting answer is
// catastrophic: making a key up. A device that does that opens the database
// happily, writes entries nobody else can read, and nothing anywhere reports a
// problem — the data forks in silence and the two halves look healthy. So this
// module never invents a key for a database it does not own. It says `waiting`
// and the screens say so too (#95).
//
// Free of OrbitDB on purpose: the stores are handed in. What is worth proving
// here is the decision, and it is provable in node — the same reason
// ./key-store.js is split the way it is.

import { createKeyFor, keyFor, rememberKey } from './keys.js';
import { claimKey, shareKey } from './key-store.js';

/**
 * @typedef {object} Holder
 * @property {string} did
 * @property {string} encryptionKey the public half this device published
 */

/**
 * @typedef {object} KeyOutcome
 * @property {Uint8Array | null} key
 * @property {'ready' | 'waiting'} state
 * @property {string[]} [unreachable] holders nothing could be sealed for
 */

/**
 * Get the key for a database, or report that it is not here.
 *
 * @param {object} options
 * @param {string} options.name the database the key opens
 * @param {string} options.ownDid
 * @param {boolean} options.isSharer whether this device is the one that shares
 *   this database's key — the person who owns it, not merely one who may read
 * @param {any} [options.ownStore] this device's key store, needed when sharing
 * @param {any} [options.sharerStore] the sharer's store, to look for a copy
 * @param {Holder[]} [options.holders] who should be able to read, when sharing
 * @returns {Promise<KeyOutcome>}
 */
export async function obtainKey({
	name,
	ownDid,
	isSharer,
	ownStore = null,
	sharerStore = null,
	holders = []
}) {
	// Already held. Checked first so that neither a missing store nor a slow
	// replication can take a key away that this device has been using.
	const held = keyFor(name);
	if (held) {
		if (isSharer && ownStore)
			await shareWith({ store: ownStore, name, key: held, holders, ownDid });
		return { key: held, state: 'ready' };
	}

	if (isSharer) {
		if (!ownStore) return { key: null, state: 'waiting' };

		// Made once, here, and only by the one device entitled to. `createKeyFor`
		// keeps it, so a reload does not produce a second key for the same
		// database — which would be the same silent fork by another route.
		const key = createKeyFor(name);
		const unreachable = await shareWith({ store: ownStore, name, key, holders, ownDid });

		return { key, state: 'ready', unreachable };
	}

	if (!sharerStore) return { key: null, state: 'waiting' };

	const given = await claimKey({ store: sharerStore, databaseName: name, ownDid }).catch(
		() => null
	);
	if (!given) return { key: null, state: 'waiting' };

	rememberKey(name, given);
	return { key: given, state: 'ready' };
}

/**
 * Leave a copy for everyone who may read, skipping those who already have one.
 *
 * Runs on every open rather than once, because the set changes: a device
 * approved this morning has to be given the key without anybody thinking to
 * press anything.
 *
 * @param {object} options
 * @param {any} options.store this device's own key store
 * @param {string} options.name the database the key opens
 * @param {Uint8Array} options.key
 * @param {Holder[]} options.holders
 * @param {string} options.ownDid
 * @returns {Promise<string[]>} holders nothing could be sealed for
 */
async function shareWith({ store, name, key, holders, ownDid }) {
	/** @type {string[]} */
	const unreachable = [];

	for (const holder of holders) {
		if (!holder?.did || holder.did === ownDid) continue;

		try {
			await shareKey({
				store,
				databaseName: name,
				recipientDid: holder.did,
				recipientPublicKey: holder.encryptionKey,
				databaseKey: key
			});
		} catch {
			// A device that has published no encryption key yet — registered before
			// they existed, or an introduction that did not arrive. Collected rather
			// than thrown: one unreachable holder must not stop the others from being
			// given the key, and the caller can say who is still waiting.
			unreachable.push(holder.did);
		}
	}

	return unreachable;
}
