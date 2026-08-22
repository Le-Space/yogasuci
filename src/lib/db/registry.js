// The registry: studio, locations and devices (docs/PLAN.md §3.1).
//
// This is the root of trust. Every other database's signatures are verified
// against it, which is why *all* roles replicate it in full — a device that
// cannot read the registry cannot tell a revoked device from a current one.
//
// Single writer: the owner. Studio devices read it and are granted write access
// to the databases they need, never to this one.

import { get, writable } from 'svelte/store';

import { ownDeviceKeys } from './device-keys.js';

import { openDocuments, readAll } from './open.js';
import { setLedgerWriteAccess } from './studio-acl.js';
import { nodeStatusStore, orbitdbStore, ownDidStore } from '../p2p/node.js';
import { programDbStore } from './program.js';

export const registryDbStore = writable(/** @type {any} */ (null));
export const studioStore = writable(/** @type {any} */ (null));
export const locationsStore = writable(/** @type {any[]} */ ([]));
export const devicesStore = writable(/** @type {any[]} */ ([]));

// A stopped node leaves every handle below it dead. Clearing them here, rather
// than expecting each caller to remember, is what keeps a closed database from
// being handed to a screen that still thinks it can write.
nodeStatusStore.subscribe(({ state }) => {
	if (state !== 'idle') return;
	registryDbStore.set(null);
	studioStore.set(null);
	locationsStore.set([]);
	devicesStore.set([]);
});

/**
 * Open the registry, or create it for a brand-new studio.
 *
 * @param {object} [options]
 * @param {string} [options.address] join an existing studio's registry
 */
export async function openRegistry({ address } = {}) {
	const db = await openDocuments({ key: 'registry', name: 'yoga-registry', address });

	registryDbStore.set(db);
	db.events.on('update', () => refreshRegistry());
	await refreshRegistry();

	return db;
}

export async function refreshRegistry() {
	const db = get(registryDbStore);
	if (!db) return;

	const documents = await readAll(db);

	studioStore.set(documents.find((doc) => doc.type === 'studio') ?? null);
	locationsStore.set(documents.filter((doc) => doc.type === 'location'));
	devicesStore.set(documents.filter((doc) => doc.type === 'device'));
}

/**
 * Name the studio, and record who owns it.
 *
 * @param {{ name: string }} studio
 */
export async function saveStudio({ name }) {
	const db = requireDb();
	const ownerDid = get(ownDidStore);

	await db.put({
		_id: 'studio',
		type: 'studio',
		name,
		// The owner DID is written once, at creation. Later edits must not be
		// able to hand the studio to someone else by renaming it.
		ownerDid: get(studioStore)?.ownerDid ?? ownerDid
	});

	await registerOwnerDevice();
	await refreshRegistry();
}

/**
 * Record the owner's own device in the registry.
 *
 * She is a device like any other, and leaving her out has bitten three times:
 * the ledger refuses events from devices it cannot find, so tickets she issued
 * were rejected as `unknown-device`; and grants driven off the device list
 * silently skipped the one person who must always be able to write. The special
 * cases those needed are gone now that the entry exists.
 *
 * Role `owner`, and no location: locations are usually created after the studio
 * is named, and an empty one is honest until she edits it. The ledger judges by
 * DID and signature, not by location.
 */
async function registerOwnerDevice() {
	const db = requireDb();
	const own = get(ownDidStore);
	const orbitdb = get(orbitdbStore);
	if (!own) return;

	const existing = await db.get(`device:${own}`);
	if (existing) return;

	await db.put({
		_id: `device:${own}`,
		type: 'device',
		deviceDid: own,
		role: 'owner',
		locationId: '',
		label: 'owner',
		publicKey: orbitdb?.identity?.publicKey ?? '',
		encryptionKey:
			(
				await ownDeviceKeys().catch((error) => {
					// Said out loud rather than swallowed: without this key nobody can wrap
					// a database key for this device, and a silent empty string is how that
					// goes unnoticed until somebody cannot read their own bookings.
					console.warn('No encryption key for this device (registry entry):', error);
					return null;
				})
			)?.publicKey ?? '',
		grantedAt: new Date().toISOString(),
		revokedAt: null
	});
}

/**
 * @param {object} location
 * @param {string} location.id short slug, e.g. `altstadt`
 * @param {{ de: string, en: string }} location.name
 * @param {string} [location.address]
 * @param {boolean} [location.active]
 */
export async function saveLocation({ id, name, address = '', active = true }) {
	const db = requireDb();

	await db.put({
		_id: `location:${id}`,
		type: 'location',
		name,
		address,
		active
	});

	await refreshRegistry();
}

/**
 * Deactivate rather than delete.
 *
 * A location that ever hosted a class is referenced by `issuedBy` and
 * `redeemedBy` on signed ticket events. Removing it would leave those events
 * pointing at nothing and break the cash reconciliation for that location.
 *
 * @param {string} locationId full `_id`, e.g. `location:altstadt`
 */
export async function deactivateLocation(locationId) {
	const db = requireDb();
	const existing = await db.get(locationId);
	if (!existing) throw new Error(`No location ${locationId}`);

	await db.put({ ...existing.value, active: false });
	await refreshRegistry();
}

/**
 * Register a studio device (docs/PLAN.md §4.1). Pairing itself is M2 — this is
 * the registry half, which is what the ledger verifies against.
 *
 * @param {object} device
 * @param {string} device.deviceDid
 * @param {'owner' | 'front-desk' | 'teacher'} device.role
 * @param {string} device.locationId
 * @param {string} device.label
 * @param {string} [device.publicKey] the OrbitDB signing key, needed to verify
 *   this device's ledger events — the DID alone cannot do it
 * @param {string} [device.encryptionKey] the public half of this device's ECDH
 *   pair, so a database key can be wrapped for it (#95)
 */
export async function registerDevice({
	deviceDid,
	role,
	locationId,
	label,
	publicKey = '',
	encryptionKey = ''
}) {
	const db = requireDb();

	// The grants come first. If the registry entry landed and an ACL write
	// failed, the studio would show a registered device that cannot actually
	// write — the confusing half. The other order fails safe: an unrecorded
	// grant is harmless, because the ledger judges events by the registry.
	await grantProgramWrite(deviceDid);
	await grantLedgerWrite(deviceDid);

	await db.put({
		_id: `device:${deviceDid}`,
		type: 'device',
		deviceDid,
		role,
		locationId,
		label,
		publicKey,
		// The half somebody else needs to wrap a database key for this device. A
		// passkey cannot receive one — it signs and nothing else — so this is a
		// second key pair the device makes for itself (#95). Empty for a device
		// registered before this existed, which is why every reader has to treat an
		// absent key as "cannot be written to yet" rather than as an error.
		encryptionKey,
		grantedAt: new Date().toISOString(),
		revokedAt: null
	});

	await refreshRegistry();
}

/**
 * Let a device write to the programme.
 *
 * The registry itself stays owner-only (docs/PLAN.md §3.1) — it is the root of
 * trust, and a front-desk device that could edit it could register itself.
 *
 * @param {string} deviceDid
 */
async function grantProgramWrite(deviceDid) {
	const program = get(programDbStore);
	if (!program?.access?.grant) return;
	await program.access.grant('write', deviceDid);
}

/**
 * Let a device write to every ticket ledger in this studio.
 *
 * One grant, not one per student: all ledgers share a single access controller
 * (src/lib/db/studio-acl.js), so this covers the students already known and every
 * one who ever pairs afterwards. Before this change the grant travelled the other
 * way — each student granting each device — which meant a counter could not sell
 * to somebody who had just walked in.
 *
 * @param {string} deviceDid
 */
async function grantLedgerWrite(deviceDid) {
	const ownerDid = get(studioStore)?.ownerDid;
	if (!ownerDid) return;

	await setLedgerWriteAccess('grant', deviceDid, ownerDid).catch((error) => {
		// Not fatal, and deliberately not silent: the device is registered either
		// way, and the ledger still judges its events by the registry. What it
		// cannot do until this succeeds is append them at all.
		console.warn('Could not grant ledger access to', deviceDid, error);
	});
}

/**
 * Revoke a device.
 *
 * The timestamp is the whole point: revocation is not retroactive. Events the
 * device signed before this moment stay valid, everything after is refused
 * (docs/LIMITS.md §1.5).
 *
 * @param {string} deviceDid
 */
export async function revokeDevice(deviceDid) {
	const db = requireDb();
	const existing = await db.get(`device:${deviceDid}`);
	if (!existing) throw new Error(`No device ${deviceDid}`);

	// Both halves, and the registry entry first this time: the timestamp is what
	// the ledger judges past events against, and it must exist even if pulling
	// the ACL grant fails. A device that still holds the grant but is marked
	// revoked writes entries every peer refuses — noisy, but not harmful.
	await db.put({ ...existing.value, revokedAt: new Date().toISOString() });
	await refreshRegistry();

	const program = get(programDbStore);
	if (program?.access?.revoke) {
		await program.access.revoke('write', deviceDid);
	}

	const ownerDid = get(studioStore)?.ownerDid;
	if (ownerDid) {
		await setLedgerWriteAccess('revoke', deviceDid, ownerDid).catch((error) => {
			console.warn('Could not revoke ledger access from', deviceDid, error);
		});
	}
}

/**
 * The device half of the registry in the shape the ledger reducer expects.
 *
 * @returns {Map<string, import('../ledger').DeviceRecord>}
 */
export function deviceRegistry() {
	return new Map(
		get(devicesStore).map((device) => [
			device.deviceDid,
			{
				deviceDid: device.deviceDid,
				role: device.role,
				locationId: device.locationId,
				grantedAt: device.grantedAt,
				revokedAt: device.revokedAt ?? null
			}
		])
	);
}

function requireDb() {
	const db = get(registryDbStore);
	if (!db) throw new Error('The registry is not open.');
	return db;
}
