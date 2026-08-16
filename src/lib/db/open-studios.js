// Open every studio this device has joined, not only the one it works in.
//
// Kept apart from `studios.js` on purpose: that file is storage and a store,
// provable in node. This one touches OrbitDB, and importing it from there would
// drag libp2p and a native module into the unit tests — the reason the list
// reads the legacy key itself rather than importing `open.js` for it.
//
// Everything here is read-only by construction. A studio a student visits is
// somebody else's registry; the access controller refuses this device's writes
// anyway, and nothing in this file tries.

import { get } from 'svelte/store';

import { openDocuments, readAll } from './open.js';
import { registryDbStore } from './registry.js';
import { storedStudios, updateStudio } from './studios.js';

/**
 * A key of its own per studio, so opening a second one does not overwrite the
 * address of the first.
 *
 * `openDocuments` remembers what it opened under the key it was given, and the
 * device's own studio uses the bare `registry` and `program`. A guest studio
 * that reused those would put its address where the counter screens look for
 * theirs — which is the bug this whole change is about, moved one layer down.
 *
 * @param {string} kind
 * @param {string} address
 */
function keyFor(kind, address) {
	return `${kind}@${address.slice(-16)}`;
}

/**
 * Load one studio and publish what it holds.
 *
 * @param {{ registry: string, program: string }} addresses
 */
async function openOne({ registry, program }) {
	const registryDb = await openDocuments({
		key: keyFor('registry', registry),
		name: 'yoga-registry',
		address: registry
	});

	const programDb = await openDocuments({
		key: keyFor('program', program),
		name: 'yoga-program',
		address: program
	});

	const publish = async () => {
		const [registryDocs, programDocs] = await Promise.all([
			readAll(registryDb),
			readAll(programDb)
		]);

		updateStudio(registry, {
			program,
			studio: registryDocs.find((doc) => doc.type === 'studio') ?? null,
			locations: registryDocs.filter((doc) => doc.type === 'location'),
			courses: programDocs.filter((doc) => doc.type === 'course'),
			packages: programDocs.filter((doc) => doc.type === 'package')
		});
	};

	// Both, because a studio's name lives in the registry and its classes in the
	// programme: a course arriving without the location it points at would render
	// with a bare id, and a name arriving without courses would look like an empty
	// studio. Whichever replicates first, the other redraws when it lands.
	registryDb.events.on('update', () => void publish());
	programDb.events.on('update', () => void publish());

	await publish();
}

/**
 * Open all remembered studios.
 *
 * The one this device already has open is skipped rather than opened twice —
 * `openRegistry` ran before this in the boot sequence, and a second handle on
 * the same address would duplicate its sync work for nothing.
 *
 * Failures are per studio and do not stop the rest. A studio whose addresses no
 * longer resolve should cost that studio, not the whole screen: a student with
 * two studios must still see the one that works.
 */
export async function openJoinedStudios() {
	const own = get(registryDbStore)?.address?.toString();

	for (const addresses of storedStudios()) {
		if (addresses.registry === own) continue;

		try {
			await openOne(addresses);
		} catch (error) {
			console.warn(`Could not open the studio at ${addresses.registry}:`, error);
		}
	}
}
