// Opening the key stores, which is the half that needs OrbitDB.
//
// Split from ./key-store.js so that file stays provable in node: reaching for
// `openDocuments` pulls in Helia and libp2p, and with them a native module that
// is not there (see the note at the top of ./studios.js).

import { get, writable } from 'svelte/store';
import { OrbitDBAccessController } from '@orbitdb/core';

import { ownDidStore } from '../p2p/node.js';
import { openDocuments } from './open.js';
import { keyStoreName } from './key-store.js';

/** This device's own store, once it is open. */
export const keyStoreDbStore = writable(/** @type {any} */ (null));

/**
 * Open the store this device writes its shared copies into.
 *
 * @returns {Promise<any>}
 */
export async function openOwnKeyStore() {
	const own = get(ownDidStore);
	if (!own) throw new Error('This device has no identity yet.');

	const db = await openDocuments({
		key: 'keys',
		name: keyStoreName(own),
		accessController: OrbitDBAccessController({ write: [own] })
	});

	keyStoreDbStore.set(db);
	return db;
}

/**
 * Open somebody else's store, to look for a copy addressed to this device.
 *
 * Read-only in the only sense that matters: the write list in the manifest names
 * that person, so an entry from anyone else is refused by the access controller
 * rather than merely hidden here.
 *
 * @param {string} did
 * @returns {Promise<any>}
 */
export async function openKeyStoreOf(did) {
	return openDocuments({
		key: `keys:${did}`,
		name: keyStoreName(did),
		accessController: OrbitDBAccessController({ write: [did] })
	});
}
