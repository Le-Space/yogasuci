// Every studio this device belongs to, not just the last one it joined.
//
// A student who goes to two studios is an ordinary case and the app could not
// hold it: `joinStudioFromPeer` wrote the registry and programme addresses under
// the fixed keys `registry` and `program`, so a second join overwrote the first
// and the previous studio was gone after the next reload.
//
// What this does *not* have to solve, contrary to how it looked at first: the
// ticket ledger. The reducer groups by ticket, and a ticket id is a random UUID
// (`tickets.js`), so passes from two studios are separate chains in one ledger
// and no balance is ever computed across them. One ledger stays right.
//
// The device's own studio — the one it created or was approved into — keeps the
// singleton stores in `registry.js` and `program.js`. The counter screens are
// about one studio by nature, and a till offering a choice of studio would be an
// invitation to redeem a pass against the wrong one.

import { derived, get, writable } from 'svelte/store';

import { scoped } from '../identity/account.js';

const STORAGE_KEY = 'yoga-p2p.studios';

/**
 * The key `open.js` writes single addresses under, read here rather than
 * imported.
 *
 * Importing `open.js` for one constant pulls in OrbitDB, Helia and libp2p —
 * which means a native module that does not exist in node, so this file could
 * not be unit tested at all. The duplication is two words and it keeps this
 * module what it is: storage logic, provable without a browser, the way
 * CLAUDE.md asks of the ledger.
 */
const LEGACY_ADDRESS_KEY = 'yoga-p2p.databases';

/**
 * @typedef {object} StudioAddresses
 * @property {string} registry
 * @property {string} program
 */

/**
 * The studios this device has joined, oldest first.
 *
 * Migrates on read rather than in a step somebody has to remember to run: a
 * device that joined before this existed has its one studio under the old flat
 * keys, and that is exactly what the list should start as.
 *
 * @returns {StudioAddresses[]}
 */
export function storedStudios() {
	try {
		const raw = localStorage.getItem(scoped(STORAGE_KEY));
		if (raw) return JSON.parse(raw);

		const { registry, program } = JSON.parse(
			localStorage.getItem(scoped(LEGACY_ADDRESS_KEY)) ?? '{}'
		);
		return registry && program ? [{ registry, program }] : [];
	} catch {
		// Storage denied, or a value somebody else wrote. Treated as "no studios
		// remembered" rather than as a failure: the device still works, it just
		// has to be pointed at its studio again.
		return [];
	}
}

/**
 * Add a studio, or leave the list alone if it is already there.
 *
 * Keyed on the registry address, which is what a join hands over and what every
 * device in a studio agrees on. Names are not unique and ids are per-registry,
 * so neither would do.
 *
 * @param {StudioAddresses} addresses
 * @returns {StudioAddresses[]} the list as it now stands
 */
export function rememberStudio({ registry, program }) {
	const studios = storedStudios();

	if (!studios.some((entry) => entry.registry === registry)) {
		studios.push({ registry, program });
	}

	try {
		localStorage.setItem(scoped(STORAGE_KEY), JSON.stringify(studios));
	} catch {
		// As above: this session keeps working, the next one starts over.
	}

	return studios;
}

export function forgetStudios() {
	try {
		localStorage.removeItem(scoped(STORAGE_KEY));
	} catch {
		// nothing to clean up
	}
}

/**
 * What each joined studio currently holds.
 *
 * Written by `openStudios`; read by the screens a student uses. Kept separate
 * from the singleton stores rather than replacing them, so the counter screens
 * go on addressing exactly one studio and cannot accidentally act on another.
 *
 * @type {import('svelte/store').Writable<{ registry: string, program: string, studio: any, locations: any[], courses: any[], packages: any[] }[]>}
 */
export const studiosStore = writable([]);

/** How many studios this device belongs to. */
export const studioCountStore = derived(studiosStore, (studios) => studios.length);

/**
 * Replace what is known about one studio, keyed by its registry address.
 *
 * @param {string} registry
 * @param {Partial<{ program: string, studio: any, locations: any[], courses: any[], packages: any[] }>} patch
 */
export function updateStudio(registry, patch) {
	studiosStore.update((studios) => {
		const at = studios.findIndex((entry) => entry.registry === registry);
		const base =
			at === -1
				? { registry, program: '', studio: null, locations: [], courses: [], packages: [] }
				: studios[at];
		const next = { ...base, ...patch };

		if (at === -1) return [...studios, next];

		const copy = [...studios];
		copy[at] = next;
		return copy;
	});
}

/** For tests and for `hangUp`, which must not leave a stale studio on screen. */
export function clearStudios() {
	studiosStore.set([]);
}

/** @returns {string[]} the registry addresses currently open */
export function openStudioAddresses() {
	return get(studiosStore).map((entry) => entry.registry);
}
