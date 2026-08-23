// Bookings — one small database per student (docs/PLAN.md §3.3).
//
// The cut that replaced a shared per-location database. A student replicates
// only their own bookings; studio devices accumulate the ones they have seen.
// Nobody ever holds a classmate's attendance record, which is what the shared
// database made unavoidable (docs/PRIVACY.md).
//
// Who creates it: the **student**. The plan leaves this open, and the student
// is the party that always has this database to hand — it travels with them
// between locations exactly like their ticket ledger. Studio devices are added
// as writers from the registry, which every device already replicates in full,
// so no extra exchange is needed to know who they are.
//
// The trade-off, stated plainly: the student is admin of their own bookings and
// could in principle revoke the studio's write access. They would only lock
// themselves out of being confirmed — the studio notices a request that never
// leaves `requested`, and its own records live elsewhere.

import { get, writable } from 'svelte/store';

import { openEncrypted } from './encrypted-open.js';
import { obtainKey } from './database-keys.js';
import { openOwnKeyStore } from './open-key-stores.js';
import { studioHolders } from './registry.js';
import { readAll } from './open.js';
import { devicesStore, studioStore } from './registry.js';
import { nodeStatusStore, ownDidStore } from '../p2p/node.js';

export const bookingsDbStore = writable(/** @type {any} */ (null));
export const bookingsStore = writable(/** @type {any[]} */ ([]));

/**
 * Bookings replicated from other students' databases, keyed by their DID.
 *
 * Studio devices only. A student device never opens a foreign bookings
 * database — it is never told an address for one.
 *
 * @type {import('svelte/store').Writable<Map<string, { did: string, db: any, bookings: any[] }>>}
 */
export const studentBookingsStore = writable(new Map());

nodeStatusStore.subscribe(({ state }) => {
	if (state !== 'idle') return;
	bookingsDbStore.set(null);
	bookingsStore.set([]);
	studentBookingsStore.set(new Map());
});

/**
 * Open this device's own bookings database, creating it on first use.
 *
 * @param {object} [options]
 * @param {string} [options.address]
 */
export async function openOwnBookings({ address } = {}) {
	const own = get(ownDidStore);
	if (!own) throw new Error('This device has no identity yet.');

	// Sealed, and this device holds the key: the bookings are its own, so it makes
	// the key and leaves a copy for the studio (#95). Which means a student never
	// waits for their own bookings — only for what somebody else shares.
	const db = await openEncrypted({
		key: 'bookings',
		// The DID is in the name so two students never collide, and so a studio
		// device can tell whose database it is looking at.
		name: `yoga-bookings-${own}`,
		address,
		sharerDid: own,
		holders: studioHolders()
	});

	if (!db) return null;

	bookingsDbStore.set(db);
	db.events.on('update', () => refreshBookings());
	await refreshBookings();
	await grantStudioDevices();

	return db;
}

export async function refreshBookings() {
	const db = get(bookingsDbStore);
	if (!db) return;
	bookingsStore.set(await readAll(db));
}

/**
 * Let every registered studio device write here.
 *
 * Driven off the registry rather than off a pairing message: a device approved
 * later must be able to confirm this student's bookings too, and the registry
 * is where that fact arrives. Re-granting an existing writer is a no-op, so
 * this can run on every open and after every registry change.
 */
export async function grantStudioDevices() {
	// The key travels the same way, and for the same reason. When this database
	// was first opened its owner belonged to no studio, so there was nobody to
	// seal a copy for — `studioHolders()` was empty and the studio would have
	// waited for a key that was never coming. Joining, and every later approval,
	// arrives here (#95).
	await shareOwnBookingsKey();

	const db = get(bookingsDbStore);
	if (!db?.access?.grant) return;

	const current = await db.access.capabilities().catch(() => null);
	const known = new Set([...(current?.write ?? []), ...(current?.admin ?? [])].map(String));

	// The owner first, and not as an afterthought: she has no `device:` entry of
	// her own — the registry lists the devices she *added* — so iterating the
	// device list alone leaves the one person who must always be able to confirm
	// a booking unable to write. That cost a debugging round.
	const writers = [
		get(studioStore)?.ownerDid,
		...get(devicesStore)
			.filter((device) => !device.revokedAt)
			.map((device) => device.deviceDid)
	].filter(Boolean);

	for (const did of writers) {
		if (known.has(did)) continue;
		await db.access.grant('write', did).catch((/** @type {any} */ error) => {
			console.warn('Could not grant a studio device access to bookings:', error);
		});
	}
}

/**
 * Ask for a place.
 *
 * `requested` is all a student may write. The studio decides — enforced by app
 * logic above the database, because OrbitDB has no field-level rights
 * (docs/LIMITS.md §1.4); a manipulated client could write any status, and the
 * writer's role stays visible in the registry either way.
 *
 * @param {object} booking
 * @param {string} booking.courseId
 * @param {string | null} booking.date null for a series booked as a whole
 * @param {string} booking.locationId
 */
export async function requestBooking({ courseId, date, locationId }) {
	const db = requireDb();
	const studentDid = get(ownDidStore);
	const id = `booking:${crypto.randomUUID()}`;

	await db.put({
		_id: id,
		type: 'booking',
		studentDid,
		courseId,
		date,
		locationId,
		status: 'requested',
		requestedAt: new Date().toISOString(),
		decidedBy: null,
		decidedAt: null
	});

	await refreshBookings();
	return id;
}

/**
 * Withdraw a request, or give a confirmed place back.
 *
 * Cancelling stays possible after confirmation — a student who cannot come
 * should say so, and the alternative is a silently unused place.
 *
 * @param {string} bookingId
 */
export async function cancelBooking(bookingId) {
	const db = requireDb();
	const existing = await db.get(bookingId);
	if (!existing) throw new Error(`No booking ${bookingId}`);

	await db.put({ ...existing.value, status: 'cancelled' });
	await refreshBookings();
}

/**
 * The studio's decision, written into that student's database.
 *
 * @param {object} decision
 * @param {any} decision.db the student's bookings database
 * @param {string} decision.bookingId
 * @param {'confirmed' | 'declined'} decision.status
 * @param {{ deviceDid: string, locationId: string }} decision.decidedBy
 */
export async function decideBooking({ db, bookingId, status, decidedBy }) {
	const existing = await db.get(bookingId);
	if (!existing) throw new Error(`No booking ${bookingId}`);

	await db.put({
		...existing.value,
		status,
		decidedBy,
		decidedAt: new Date().toISOString()
	});
}

/**
 * Open a student's bookings database on a studio device.
 *
 * @param {string} studentDid
 * @param {string} address
 */
export async function openStudentBookings(studentDid, address) {
	// Opened by address, so the name is never used — but the key keeps the
	// address remembered, which is what lets a studio device find this student
	// again after a reload.
	//
	// The student made this key, so the copy for this device is in *their* store.
	// Until it has replicated there is nothing to open, and opening it anyway
	// would write in the clear beside their sealed entries.
	//
	// `onLater` is not a nicety here, it is the ordinary case: this runs the
	// moment the student introduces itself, which is before that student has seen
	// the registry and therefore before it knows whom to seal a key for. The copy
	// follows seconds later.
	/** @param {any} db */
	const attach = async (db) => {
		const load = async () => {
			const bookings = await readAll(db);
			studentBookingsStore.update((all) => {
				const next = new Map(all);
				next.set(studentDid, { did: studentDid, db, bookings });
				return next;
			});
		};

		db.events.on('update', load);
		await load();
	};

	const db = await openEncrypted({
		key: `bookings:${studentDid}`,
		name: `yoga-bookings-${studentDid}`,
		address,
		sharerDid: studentDid,
		onLater: attach
	});

	if (!db) return null;

	await attach(db);
	return db;
}

function requireDb() {
	const db = get(bookingsDbStore);
	if (!db) throw new Error('The bookings database is not open.');
	return db;
}

/**
 * Leave a copy of this database's key for every studio device.
 *
 * Separate from the ACL grants above only because it can fail differently: a
 * device that has published no encryption key cannot be sealed for, and that is
 * worth naming rather than retrying forever.
 *
 * Idempotent by construction — `obtainKey` returns the key it already has and
 * writes a copy per holder, and writing the same copy twice is one document.
 */
export async function shareOwnBookingsKey() {
	const own = get(ownDidStore);
	const holders = studioHolders();
	if (!own || holders.length === 0) return;

	try {
		await obtainKey({
			name: `yoga-bookings-${own}`,
			ownDid: own,
			isSharer: true,
			ownStore: await openOwnKeyStore(),
			holders
		});
	} catch (error) {
		console.warn('Could not share the bookings key with the studio:', error);
	}
}
