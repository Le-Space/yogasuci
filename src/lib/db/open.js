// Opening databases, and remembering which ones this device belongs to.
//
// Every database here is a `documents` store keyed by `_id`, matching the
// schemas in docs/PLAN.md §3. They are created with an OrbitDBAccessController
// whose initial write set is only the creator — grants for other devices are
// added at runtime without the address changing, which is the acl01 pattern
// this project inherits.

import { get, writable } from 'svelte/store';
import { OrbitDBAccessController } from '@orbitdb/core';

import { orbitdbStore } from '../p2p/node.js';
import { scoped } from '../identity/account.js';

/**
 * Where this device's database addresses are remembered.
 *
 * Addresses, not names: an OrbitDB address encodes the manifest, so reopening
 * by address gets the same database with the same access controller. Reopening
 * by name would create a *new* one under this device's identity — the studio
 * would silently fork on the first reload.
 */
const ADDRESS_STORAGE_KEY = 'yoga-p2p.databases';

/**
 * Per account, not per device.
 *
 * A device can hold a studio passkey and a personal one, and until this was
 * scoped the second signed-in account found the first one's registry here and
 * opened it as its own — the studio's owner check then answered no on the very
 * device that had created it (#82).
 */
function addressKey() {
	return scoped(ADDRESS_STORAGE_KEY);
}

/** @returns {Record<string, string>} */
export function storedAddresses() {
	try {
		return JSON.parse(localStorage.getItem(addressKey()) ?? '{}');
	} catch {
		return {};
	}
}

/**
 * @param {string} key
 * @param {string} address
 */
export function rememberAddress(key, address) {
	try {
		localStorage.setItem(addressKey(), JSON.stringify({ ...storedAddresses(), [key]: address }));
	} catch {
		// Storage blocked — the database still works for this session, it just
		// will not be found again after a reload.
	}
}

export function forgetAddresses() {
	try {
		localStorage.removeItem(addressKey());
	} catch {
		// nothing to clean up
	}
}

/**
 * Open a database this device already knows, or create it.
 *
 * @param {object} options
 * @param {string} options.key how this database is remembered locally
 * @param {string} options.name the database name used when creating it
 * @param {string} [options.address] open this exact address instead of the
 *   remembered one — this is how a paired device joins the studio's databases
 * @param {any} [options.accessController] use this access controller instead of
 *   the default one. Ticket ledgers pass the shared studio controller, which is
 *   what makes their address the same on every device (see ./studio-acl.js)
 * @returns {Promise<any>} the opened OrbitDB documents store
 */
export async function openDocuments({ key, name, address, accessController }) {
	const orbitdb = get(orbitdbStore);
	if (!orbitdb) throw new Error('The node is not running yet.');

	const target = address ?? storedAddresses()[key];

	const db = await orbitdb.open(target ?? name, {
		type: 'documents',
		create: true,
		sync: true,
		// Only the creator may write at first. Everything else is a runtime
		// grant, so the address stays stable as the studio grows.
		AccessController: accessController ?? OrbitDBAccessController({ write: [orbitdb.identity.id] })
	});

	rememberAddress(key, db.address.toString());
	recordReplicationErrors(db);
	openDatabases.set(db.address.toString(), { key, db });
	trackFreshness(key, db);

	pullHistory(db);

	return db;
}

/**
 * What each open database looks like right now, for the sync status strip.
 *
 * @type {import('svelte/store').Writable<{ key: string, address: string, entries: number, changedAt: string | null, syncedAt: string | null }[]>}
 */
export const databaseStatusStore = writable(/** @type {any[]} */ ([]));

/**
 * Keep the status store in step with one database.
 *
 * `changedAt` is deliberately *this device's* clock at the moment something
 * arrived, not a timestamp taken from the data. An OrbitDB entry carries a logical
 * clock, not a wall time, and the wall times inside our documents say when an
 * event happened rather than when it got here. "Last change seen here at 14:32" is
 * something this device actually knows; "your data is current as of …" is not, and
 * a status line that overstates its knowledge is worse than none at a counter.
 *
 * @param {string} key
 * @param {any} db
 */
function trackFreshness(key, db) {
	const address = db.address.toString();

	// The last time a peer's heads reached this database. Separate from
	// `changedAt` because `update` cannot tell the two apart: OrbitDB emits it
	// both from `addOperation` (this device wrote) and `applyOperation` (a peer
	// sent it). `join` fires only on the receiving side, which makes it the one
	// event that answers "did anything actually come in".
	let syncedAt = /** @type {string | null} */ (null);

	const publish = async () => {
		const entries = await db.all().then(
			(/** @type {any[]} */ rows) => rows.length,
			() => 0
		);

		databaseStatusStore.update((rows) => {
			const next = rows.filter((row) => row.address !== address);
			next.push({ key, address, entries, changedAt: new Date().toISOString(), syncedAt });
			return next.sort((a, b) => (a.key < b.key ? -1 : 1));
		});
	};

	db.events.on('update', publish);

	// Recorded even when the exchange brought nothing new. "A device synchronised
	// with us at 14:32" is true either way, and it is the answer to the question
	// somebody at a counter is actually asking — whether the two are talking.
	db.events.on('join', () => {
		syncedAt = new Date().toISOString();
		void publish();
	});

	publish();
}

/**
 * Stop tracking a database this device has closed.
 *
 * Called by the LRU when it evicts a student's ledger (./lru.js). Without it the
 * diagnostics and the sync status would keep reporting handles that are gone, and
 * `pullHistory` would keep asking peers about them.
 *
 * @param {string | undefined} address
 */
export function forgetDatabase(address) {
	if (!address) return;
	openDatabases.delete(address);
	databaseStatusStore.update((rows) => rows.filter((row) => row.address !== address));
}

/** Forget the status of databases that are no longer open. */
export function forgetDatabaseStatus() {
	databaseStatusStore.set([]);
}

/** How often to ask again for history, and how long to wait between tries. */
const HISTORY_ATTEMPTS = 5;
const HISTORY_INTERVAL_MS = 2_000;

/** Set while a full re-ask is running, so overlapping triggers collapse into one. */
let askingAll = false;

/**
 * Ask every open database's peers what they have.
 *
 * Called when a new peer turns up, because that is the moment there is something
 * new to learn and the moment OrbitDB does the least about it. Two upstream
 * behaviours combine against the courier model this app is built on
 * (orbitdb/orbitdb#1255, and Le-Space/yogasuci#13):
 *
 *   - a device only publishes entries it appended *itself*, so a student holding
 *     a redemption written at the other location never forwards it;
 *   - the heads exchange happens once per peer, and reconnecting to a peer that
 *     was never dropped from `sync.peers` does not repeat it.
 *
 * Together those mean a counter can be connected to the courier who is carrying
 * exactly the entry it is missing, and never receive it. `pullHistory` does not
 * cover this: it deliberately only rescues an empty log, and here the log is
 * merely behind.
 *
 * Bounded and idempotent: one pass per trigger, overlapping triggers collapse,
 * and asking again when there is nothing new costs one round trip per database.
 */
export async function askPeersForHistory() {
	if (askingAll) return;
	askingAll = true;

	try {
		for (const { db } of [...openDatabases.values()]) {
			if ([...(db.sync?.peers ?? [])].length === 0) continue;
			try {
				await db.sync.stop();
				await db.sync.start();
			} catch (/** @type {any} */ error) {
				replicationErrors.push({
					address: db.address.toString(),
					name: error?.name ?? 'Error',
					message: `asking peers for history failed: ${error?.message ?? String(error)}`,
					at: new Date().toISOString()
				});
			}
		}
	} finally {
		askingAll = false;
	}
}

/**
 * Ask again for a peer's history while this database is still empty.
 *
 * Opening a database that a connected peer already holds is supposed to pull
 * their heads once, and often does. When it does not, it fails in total silence:
 * the topic is subscribed, the gossipsub mesh is formed, both sides list each
 * other as sync peers, no `error` event is emitted anywhere — and the log stays
 * at zero entries indefinitely. One `sync.stop()` / `sync.start()` then brings
 * everything within seconds, which is what this does on a schedule.
 *
 * Why it happens: the entries do arrive, and are then refused. An
 * `OrbitDBAccessController` is itself an OrbitDB database, so a device opening a
 * log for the first time has to replicate the *write set* before it can validate
 * anything written to that log. Both travel over the same connection at once, and
 * when the entries win that race `canAppend` judges them against a write set that
 * is not there yet — `Could not append entry: Key "<hash>" is not allowed to
 * write to the log`. Upstream's database.js turns that into a bare
 * `console.error` instead of an `error` event, which is why no diagnostic sees
 * it. The write set lands moments later, but the refused entries are never
 * offered again.
 *
 * So this is the grant race of §1.7 seen from the reading side: correct data,
 * arrived too early, dropped for good. Measured evidence in docs/LIMITS.md §1.8.
 *
 * Deliberately conservative: it only ever rescues total silence, never tops up a
 * log that is merely behind, and it gives up after a bounded number of tries. A
 * genuinely empty ledger — a student who has never bought anything — is the
 * normal case, and must not turn into an endless retry loop at the counter.
 *
 * Not awaited by the caller: a check-in screen should render from what is here
 * now and update when more arrives, not block on a peer that may be gone.
 *
 * @param {any} db
 */
async function pullHistory(db) {
	for (let attempt = 0; attempt < HISTORY_ATTEMPTS; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, HISTORY_INTERVAL_MS));

		// Stop as soon as anything at all is here, and stop if the database was
		// closed in the meantime — a page navigation is not an error to report.
		if (!openDatabases.has(db.address.toString())) return;
		if ((await db.log.heads().catch(() => [])).length > 0) return;

		// Nobody to ask yet. Not a failure — the student may still be walking in.
		if ([...(db.sync?.peers ?? [])].length === 0) continue;

		try {
			await db.sync.stop();
			await db.sync.start();
		} catch (/** @type {any} */ error) {
			// Same treatment as any other replication problem: recorded, not fatal.
			replicationErrors.push({
				address: db.address.toString(),
				name: error?.name ?? 'Error',
				message: `asking again for history failed: ${error?.message ?? String(error)}`,
				at: new Date().toISOString()
			});
			return;
		}
	}
}

/**
 * Replication problems OrbitDB reported.
 *
 * OrbitDB's sync emits its failures as `error` events and carries on. Nobody
 * listening means a database that never replicates looks exactly like one with
 * nothing in it — which cost real debugging time once already.
 *
 * @type {{ address: string, message: string, name: string, at: string }[]}
 */
export const replicationErrors = [];

/**
 * Every database this device currently has open, keyed by address.
 *
 * Opening is funnelled through this module, so this is the one place that can
 * answer "what is actually open, and how much is in it" — the question that
 * separates "did not replicate" from "replicated into a different database".
 *
 * @type {Map<string, any>}
 */
export const openDatabases = new Map();

/** @param {any} db */
function recordReplicationErrors(db) {
	db.events.on('error', (/** @type {any} */ error) => {
		replicationErrors.push({
			address: db.address.toString(),
			name: error?.name ?? 'Error',
			message: error?.message ?? String(error),
			at: new Date().toISOString()
		});
		// Bounded: this is a diagnostic, not a log store.
		if (replicationErrors.length > 50) replicationErrors.shift();
		console.warn('OrbitDB replication error', db.address.toString(), error);
	});
}

/**
 * Read every document, sorted by `_id` so two devices holding the same log
 * render the same order.
 *
 * @param {any} db
 * @returns {Promise<any[]>}
 */
export async function readAll(db) {
	const rows = await db.all();
	return rows
		.map((/** @type {any} */ row) => row.value)
		.sort((/** @type {any} */ a, /** @type {any} */ b) => (a._id < b._id ? -1 : 1));
}
