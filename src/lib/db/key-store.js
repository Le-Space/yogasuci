// Where a person leaves the database keys they have shared.
//
// A wrapped key is already sealed to one recipient (./wrapping.js), so this
// database is not encrypted and does not need to be: a copy addressed to the
// counter tells a student's phone nothing, even though both replicate it.
//
// Which is also why the keys cannot live inside the database they open. That is
// the obvious place and it is a circle — the copy would be sealed with the key
// it is meant to deliver. A store of its own breaks it, at the price of one more
// database per person.
//
// Nobody is told its address. The write list is pinned to one DID, and an
// OrbitDB manifest is `{ name, type, accessController }` with no trace of who
// created it, so every device that opens `yoga-keys-<did>` by name arrives at
// the same address — the trick ./studio-acl.js already relies on for ledgers.
// A studio that has never met a student can therefore look for the copy that
// student left for it.

// Free of `p2p/node.js` and `./open.js` on purpose: both reach libp2p, which
// means a native module node does not have, and importing either would make
// this file impossible to unit test — the same reason ./studios.js keeps its
// distance. Opening the databases lives in ./open-key-stores.js instead, and
// what is left here is the part worth proving: who a copy is for, and whether
// it opens.

import { unwrapKey, wrapKey } from './wrapping.js';
import { ownDeviceKeys, importDeviceKey } from './device-keys.js';

/** @param {string} did */
export function keyStoreName(did) {
	return `yoga-keys-${did}`;
}

/**
 * @param {string} databaseName
 * @param {string} recipientDid
 */
function copyId(databaseName, recipientDid) {
	return `key:${databaseName}:${recipientDid}`;
}

/**
 * Leave a copy of a database key for one recipient.
 *
 * @param {object} options
 * @param {any} options.store this device's own key store
 * @param {string} options.databaseName the database the key opens
 * @param {string} options.recipientDid
 * @param {string} options.recipientPublicKey as published in the registry or an introduction
 * @param {Uint8Array} options.databaseKey
 */
export async function shareKey({
	store,
	databaseName,
	recipientDid,
	recipientPublicKey,
	databaseKey
}) {
	if (!recipientPublicKey) {
		// A device registered before it published a key, or one whose introduction
		// was lost. Said out loud: silently skipping it is how somebody ends up
		// unable to read a database everyone assumes they can.
		throw new Error(`No published key for ${recipientDid}, so nothing can be sealed for them.`);
	}

	const copy = await wrapKey(databaseKey, await importDeviceKey(recipientPublicKey));

	await store.put({
		_id: copyId(databaseName, recipientDid),
		type: 'wrapped-key',
		database: databaseName,
		recipientDid,
		...copy
	});
}

/**
 * Find and open the copy left for this device, if there is one.
 *
 * @param {object} options
 * @param {any} options.store the store belonging to whoever shared the key
 * @param {string} options.databaseName
 * @param {string} options.ownDid which copy is this device's
 * @returns {Promise<Uint8Array | null>} null when nothing was left for this device
 */
export async function claimKey({ store, databaseName, ownDid }) {
	if (!ownDid) return null;

	const copy = await store.get(copyId(databaseName, ownDid)).catch(() => null);
	if (!copy?.value?.wrapped) return null;

	const { privateKey } = await ownDeviceKeys();

	// A copy that will not open is a fact worth having rather than a null: it
	// means this device's published key changed after the copy was made, and the
	// answer is to be sent a new one — not to carry on as though none existed.
	return unwrapKey(copy.value, privateKey);
}
