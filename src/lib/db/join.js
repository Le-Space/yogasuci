// Joining someone else's studio (T2.2).
//
// A device that scanned a studio's QR code asks the peer for its addresses and
// opens those databases instead of its own. From that moment OrbitDB replicates
// the registry and the programme over the direct WebRTC connection — no relay,
// no server, and nothing else had to be exchanged by hand.
//
// Read-only in every sense that matters: the databases were created with the
// studio owner in their access controller, so a write from here is refused by
// the ACL, not merely hidden by the UI. Gaining write access is a registry
// entry plus a grant (T2.3, T3.1).

import { derived, get, writable } from 'svelte/store';

import { libp2pStore, orbitdbStore, ownDidStore } from '../p2p/node.js';
import { introduceSelf, requestStudio } from '../p2p/studio-protocol.js';
import { devicesStore, openRegistry, registryDbStore, studioStore } from './registry.js';
import { bookingsDbStore, openStudentBookings } from './bookings.js';
import { noteIntroduction as note } from './introduction-log.js';
import { openStudentTickets } from './tickets.js';
import { openProgram, programDbStore } from './program.js';
import { rememberAddress } from './open.js';
import { rememberStudio } from './studios.js';
import { ownDeviceKeys } from './device-keys.js';
import { openJoinedStudios } from './open-studios.js';

/**
 * Devices that have introduced themselves but are not registered yet.
 *
 * Kept in memory only: an introduction is a claim from a peer, and claims do
 * not belong in the registry until the owner has acted on one. Keyed by DID so
 * a device reconnecting does not queue up twice.
 *
 * @type {import('svelte/store').Writable<Map<string, { peerId: string, did: string, label: string, publicKey?: string, encryptionKey?: string, bookingsAddress?: string | null, seenAt: string }>>}
 */
export const pendingDevicesStore = writable(new Map());

/**
 * @param {{ peerId: string, did: string, label: string, publicKey?: string, encryptionKey?: string, bookingsAddress?: string | null }} hello
 */
export function rememberPendingDevice(hello) {
	note({
		direction: 'received',
		did: hello.did,
		detail: `studioDevice=${canEditProgram()} bookings=${Boolean(hello.bookingsAddress)}`
	});

	pendingDevicesStore.update((pending) => {
		const next = new Map(pending);
		next.set(hello.did, { ...hello, seenAt: new Date().toISOString() });
		return next;
	});

	// Any studio device, not only the owner: a front-desk device at the second
	// location has to open the ledger of a student standing in front of it, and
	// checking `isOwnStudio()` here left it blind — which is exactly the case the
	// courier design exists for (docs/PLAN.md §5, layer 1).
	if (!canEditProgram()) return;

	// Opened without waiting for an approval: a request or a ticket has to be
	// *visible* before anyone can act on it, and reading a database somebody
	// handed over grants nothing.
	if (hello.bookingsAddress) {
		openStudentBookings(hello.did, hello.bookingsAddress).catch((error) => {
			console.warn('Could not open the introducing device’s bookings:', error);
		});
	}

	// The ledger too: a counter cannot sell or check in against a ledger it
	// cannot see, and pulling the heads *before* deciding anything is the whole
	// double-spend mechanism (docs/PLAN.md §4.3).
	//
	// Derived, not received. The ledger belongs to the studio and its address
	// follows from the student's DID plus the owner's (src/lib/db/studio-acl.js),
	// so a counter opens the right one for somebody it has never met and cannot be
	// pointed at a different database by whoever is standing in front of it.
	const ownerDid = get(studioStore)?.ownerDid;
	if (ownerDid) {
		openStudentTickets(hello.did, ownerDid).catch((error) => {
			console.warn('Could not open the introducing device’s ledger:', error);
		});
	}
}

/** @param {string} did */
export function forgetPendingDevice(did) {
	pendingDevicesStore.update((pending) => {
		const next = new Map(pending);
		next.delete(did);
		return next;
	});
}

export const joinStore = writable(
	/** @type {{ state: 'idle' | 'joining' | 'joined' | 'error', error: string | null, studioName: string | null }} */ ({
		state: 'idle',
		error: null,
		studioName: null
	})
);

/**
 * True when this device owns the studio it currently has open.
 *
 * The owner DID is written into the registry once, at creation, so this
 * survives replication: a joining device reads the same document and correctly
 * concludes that it is not the owner.
 */
export function isOwnStudio() {
	const studio = get(studioStore);
	const own = get(ownDidStore);
	// A studio that has not been named yet has no owner recorded, and the only
	// device that can be looking at it is the one that just created it.
	if (!studio?.ownerDid) return true;
	return studio.ownerDid === own;
}

/**
 * True when this device is a registered, unrevoked studio device.
 *
 * The registry is the authority, not local state: a device learns it was
 * approved — or revoked — by replicating the entry the owner wrote. That is the
 * same document the ledger checks signatures against, so the editor a device
 * shows itself and the writes its peers will accept cannot drift apart.
 */
export function isRegisteredDevice() {
	const own = get(ownDidStore);
	if (!own) return false;

	const device = get(devicesStore).find((entry) => entry.deviceDid === own);
	return Boolean(device) && !device.revokedAt;
}

/** Owner, or an approved device: the two ways to hold write access. */
export function canEditProgram() {
	return isOwnStudio() || isRegisteredDevice();
}

/**
 * What this device announces to peers that ask.
 *
 * @returns {import('../p2p/studio-protocol.js').StudioAnnouncement | null}
 */
export function describeOwnStudio() {
	const registry = get(registryDbStore);
	const program = get(programDbStore);
	const studio = get(studioStore);

	if (!registry || !program) return null;

	return {
		protocolVersion: '1.0.0',
		studioName: studio?.name ?? null,
		ownerDid: studio?.ownerDid ?? get(ownDidStore) ?? '',
		registryAddress: registry.address.toString(),
		programAddress: program.address.toString()
	};
}

/**
 * Tell a connected peer who this device is.
 *
 * Separate from joining, and called on **every** connection — that separation
 * was a bug once: a student who had already joined a studio skipped the
 * introduction entirely, so the second location never learned his DID or ledger
 * address and could not check him in. Introducing is not joining. It hands over
 * where to look and grants nothing; the write access came from the registry.
 *
 * @param {string} peerId
 */
export async function introduceToPeer(peerId) {
	const libp2p = get(libp2pStore);
	const ownDid = get(ownDidStore);
	if (!libp2p || !ownDid) return;

	const self = {
		did: ownDid,
		label: navigator.userAgent.slice(0, 80),
		publicKey: get(orbitdbStore)?.identity?.publicKey ?? '',
		// So a studio can wrap this device's ledger key for it later, without the
		// device having to be present when that happens (#95).
		encryptionKey:
			(
				await ownDeviceKeys().catch((error) => {
					// Said out loud rather than swallowed: without this key nobody can wrap
					// a database key for this device, and a silent empty string is how that
					// goes unnoticed until somebody cannot read their own bookings.
					console.warn('No encryption key for this device (introduction):', error);
					return null;
				})
			)?.publicKey ?? '',
		bookingsAddress: get(bookingsDbStore)?.address?.toString() ?? null
	};

	try {
		await introduceSelf(libp2p, peerId, self);
		note({ direction: 'sent', did: ownDid, detail: `bookings=${Boolean(self.bookingsAddress)}` });
	} catch (/** @type {any} */ error) {
		// Recorded rather than swallowed: a peer that does not speak this protocol
		// is fine, but so far every silent failure here has been a real one.
		note({ direction: 'failed', did: ownDid, detail: error?.message ?? String(error) });
	}
}

/**
 * Ask a connected peer for its studio and open it here.
 *
 * @param {string} peerId the peer from the QR handshake
 * @returns {Promise<{ studioName: string | null }>}
 */
export async function joinStudioFromPeer(peerId) {
	const libp2p = get(libp2pStore);
	if (!libp2p) throw new Error('The node is not running.');

	joinStore.set({ state: 'joining', error: null, studioName: null });

	try {
		// Say who we are before asking anything. The studio cannot register a
		// device whose DID it never learned, and the introduction has to happen
		// while the connection is up.
		// Through `introduceToPeer` rather than assembled again here. It used to be
		// built twice, and the copies drifted the moment one of them gained a field:
		// this one ran second, so a studio received the full introduction and then
		// immediately overwrote it with one that was missing the device's encryption
		// key — the pending entry is keyed by DID, so the last message wins. Nothing
		// reported it, because both messages were perfectly well formed.
		await introduceToPeer(peerId);

		const announcement = await requestStudio(libp2p, peerId);
		if (!announcement) {
			throw new Error('That device does not offer a studio.');
		}

		// Remembered before opening: if opening the programme fails halfway, a
		// reload should still find its way back to the studio rather than
		// silently creating a fresh, empty one under this device's identity.
		rememberAddress('registry', announcement.registryAddress);
		rememberAddress('program', announcement.programAddress);

		// And into the list, which is what survives a second join. The two flat keys
		// above still name the studio this device is *currently* working in — a
		// counter is about exactly one — but they are overwritten every time, so on
		// their own they lose the studio a student joined last week the moment that
		// student pairs with another one. #68.
		rememberStudio({
			registry: announcement.registryAddress,
			program: announcement.programAddress
		});

		await openRegistry({ address: announcement.registryAddress });
		await openProgram({ address: announcement.programAddress });

		// Now the others, and the order is what makes this simple: the studio just
		// joined has become this device's own, so it is the one skipped, and what
		// gets opened is everything joined before — which is exactly what would
		// otherwise vanish from the screen until the next reload.
		void openJoinedStudios();

		joinStore.set({
			state: 'joined',
			error: null,
			studioName: announcement.studioName
		});

		return { studioName: announcement.studioName };
	} catch (/** @type {any} */ error) {
		joinStore.set({
			state: 'error',
			error: error?.message ?? String(error),
			studioName: null
		});
		throw error;
	}
}

/**
 * Whether this device belongs to any studio at all.
 *
 * Kept apart from `canEditStore` because the two failures need opposite answers
 * and were being given the same one: a device with no studio was told "you are
 * viewing this studio as a guest", which describes a situation it is not in and
 * names a studio that does not exist (#84). Not knowing a studio calls for
 * pairing; knowing somebody else's calls for nothing at all.
 */
export const joinedStudioStore = derived(studioStore, (studio) => Boolean(studio));

/**
 * Whether this device may write to the studio it currently has open.
 *
 * The one definition of a test that had been copied into four components as
 * `Boolean($studioStore) && Boolean($devicesStore) && canEditProgram()`. Only
 * the last term carries meaning; the two `Boolean(...)` are there so the
 * expression re-runs, because `canEditProgram()` reaches into both stores with
 * `get` and would otherwise answer once and never again — a device approved a
 * minute ago would keep a student's screen until the next reload.
 *
 * Expressed as a derived store, that subscription is the store's job rather than
 * something each caller has to remember and none of them could get wrong twice.
 */
export const canEditStore = derived(
	[studioStore, devicesStore],
	([studio, devices]) => Boolean(studio) && Boolean(devices) && canEditProgram()
);
