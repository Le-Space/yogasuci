// Bringing a device into service: passkey → node → registry + programme.
//
// The order matters. OrbitDB's access controller freezes the creator's identity
// into the database manifest, so the passkey has to exist *before* any database
// is opened — otherwise the studio would be owned by a throwaway identity and
// the real owner could never write to it.

import { derived, get, writable } from 'svelte/store';

import { startNode, ownDidStore, orbitdbStore, libp2pStore } from '../p2p/node.js';
import { listenForDevices, serveStudio } from '../p2p/studio-protocol.js';
import { describeOwnStudio, rememberPendingDevice } from '../db/join.js';
import { openRegistry, registryDbStore } from '../db/registry.js';
import { openProgram, programDbStore } from '../db/program.js';
import { openJoinedStudios } from '../db/open-studios.js';
import { grantStudioDevices, openOwnBookings } from '../db/bookings.js';
import { openOwnTickets, ticketsDbStore } from '../db/tickets.js';
import { devicesStore, studioStore } from '../db/registry.js';
import {
	createPasskeyCredential,
	hasStoredPasskeyCredential,
	recoverPasskeyCredential
} from './passkey-identity.js';

/**
 * @typedef {'idle' | 'starting' | 'ready' | 'error'} BootState
 */

export const bootStore = writable(
	/** @type {{ state: BootState, error: string | null }} */ ({
		state: 'idle',
		error: null
	})
);

/**
 * Whether the app actually has what a studio screen needs.
 *
 * Derived from the live handles rather than tracked as a flag. A flag was the
 * original bug: tearing the node down left `bootStore` reading `ready`, so the
 * editor rendered over closed databases and every write failed with "the
 * registry is not open". State that can go stale should not be the gate —
 * whatever stops the node now flips this by construction.
 */
export const studioReady = derived(
	[orbitdbStore, registryDbStore, programDbStore],
	([orbitdb, registry, program]) => Boolean(orbitdb) && Boolean(registry) && Boolean(program)
);

/** True when this browser profile has a passkey it can come back to. */
export function hasIdentity() {
	return hasStoredPasskeyCredential();
}

/**
 * Register a new passkey and open this device's databases.
 *
 * @param {{ userId: string, displayName: string }} identity
 */
export async function createIdentityAndBoot({ userId, displayName }) {
	return boot(() => createPasskeyCredential({ userId, displayName }));
}

/**
 * Come back with an existing passkey — after a reload, or on a new device
 * whose platform authenticator has synced the credential.
 */
export async function recoverIdentityAndBoot() {
	return boot(async () => {
		const credential = await recoverPasskeyCredential();
		if (!credential) throw new Error('No passkey found on this device.');
		return credential;
	});
}

/**
 * Restore the session on page load without prompting.
 *
 * A reload must not cost the user a WebAuthn interaction, so this only runs
 * when the credential is already in local storage. It is the difference between
 * "the app remembers me" and "the app asks who I am on every refresh".
 */
export async function bootIfIdentityKnown() {
	if (!hasStoredPasskeyCredential()) return false;
	if (get(studioReady)) return true;

	await recoverIdentityAndBoot();
	return true;
}

/** @param {() => Promise<any>} obtainCredential */
async function boot(obtainCredential) {
	bootStore.set({ state: 'starting', error: null });

	try {
		const passkeyCredential = await obtainCredential();
		await startNode({ passkeyCredential });

		if (!get(ownDidStore)) {
			throw new Error('The passkey did not produce a DID.');
		}

		// Both databases open together: the registry is the trust root and the
		// programme is meaningless without the locations it points at.
		await openRegistry();
		await openProgram();

		// Every device keeps its own bookings, students and studio alike: a studio
		// device that also books classes is a person, not a special case.
		await openOwnBookings();

		// The other studios a student has joined, after this device's own so that
		// one can be skipped rather than opened twice. Deliberately not awaited: a
		// studio that is slow to replicate must not hold up a screen somebody can
		// already use, and each publishes itself as it lands. #68.
		void openJoinedStudios();

		// A device approved after this student paired must still be able to
		// confirm their bookings, so the grants follow the registry rather than a
		// one-off pairing message.
		// Both stores: the owner comes from the studio document, the rest from the
		// device list, and either can arrive by replication after this point.
		const regrant = () => {
			grantStudioDevices().catch(() => {});
		};
		devicesStore.subscribe(regrant);
		studioStore.subscribe(regrant);

		// The ledger cannot be opened yet on a device that has not joined a studio:
		// it belongs to the studio, and its address follows from the owner's DID
		// (src/lib/db/studio-acl.js). For a returning student that DID arrives by
		// replication moments from now, so this waits for it rather than guessing.
		studioStore.subscribe((studio) => {
			if (!studio?.ownerDid || get(ticketsDbStore)) return;
			openOwnTickets({ ownerDid: studio.ownerDid }).catch((error) => {
				console.warn('Could not open this device’s ledger:', error);
			});
		});

		// Answer peers that ask which studio this device belongs to. Registered
		// after the databases exist, so the first answer is never an empty one.
		await serveStudio(get(libp2pStore), describeOwnStudio);
		await listenForDevices(get(libp2pStore), rememberPendingDevice);

		bootStore.set({ state: 'ready', error: null });
	} catch (/** @type {any} */ error) {
		bootStore.set({ state: 'error', error: error?.message ?? String(error) });
		throw error;
	}
}
