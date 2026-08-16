// Runs in node, so storage is stubbed the way handoff.spec.js and
// short-code.spec.js stub theirs. That is not a compromise here: the case worth
// pinning is a device that joined *before* this list existed, and a real
// localStorage cannot be put into that state on demand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

import { rememberStudio, storedStudios, updateStudio, studiosStore } from './studios.js';

function fakeStorage(seed = {}) {
	const values = new Map(Object.entries(seed));

	return {
		/** @param {string} key */
		getItem: (key) => (values.has(key) ? values.get(key) : null),
		/** @param {string} key @param {string} value */
		setItem: (key, value) => values.set(key, value),
		/** @param {string} key */
		removeItem: (key) => values.delete(key)
	};
}

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
	studiosStore.set([]);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the studios a device remembers', () => {
	it('starts empty', () => {
		expect(storedStudios()).toEqual([]);
	});

	it('keeps both when a second one is joined', () => {
		// The whole point. Joining a second studio used to overwrite the first,
		// because both were written under the fixed keys `registry` and `program`.
		rememberStudio({ registry: 'addr-a', program: 'prog-a' });
		rememberStudio({ registry: 'addr-b', program: 'prog-b' });

		expect(storedStudios()).toEqual([
			{ registry: 'addr-a', program: 'prog-a' },
			{ registry: 'addr-b', program: 'prog-b' }
		]);
	});

	it('does not add the same studio twice', () => {
		// Pairing again at the counter is normal — a student reconnects every visit.
		rememberStudio({ registry: 'addr-a', program: 'prog-a' });
		rememberStudio({ registry: 'addr-a', program: 'prog-a' });

		expect(storedStudios()).toHaveLength(1);
	});

	it('keys on the registry address rather than the name', () => {
		// Two studios may share a name, and ids are only unique inside one
		// registry. The address is what a join hands over and what every device in
		// a studio agrees on.
		rememberStudio({ registry: 'addr-a', program: 'prog-a' });
		rememberStudio({ registry: 'addr-b', program: 'prog-a' });

		expect(storedStudios()).toHaveLength(2);
	});
});

describe('a device that joined before this list existed', () => {
	it('finds its studio under the old flat keys', () => {
		// Migration on read rather than a step somebody has to remember to run.
		// Every device in the field is in exactly this state.
		vi.stubGlobal(
			'localStorage',
			fakeStorage({
				'yoga-p2p.databases': JSON.stringify({ registry: 'old-addr', program: 'old-prog' })
			})
		);

		expect(storedStudios()).toEqual([{ registry: 'old-addr', program: 'old-prog' }]);
	});

	it('does not invent one when there is nothing to migrate', () => {
		vi.stubGlobal('localStorage', fakeStorage({ 'yoga-p2p.databases': JSON.stringify({}) }));

		expect(storedStudios()).toEqual([]);
	});
});

describe('what the screens read', () => {
	it('adds a studio the first time it is described', () => {
		updateStudio('addr-a', { studio: { name: 'Yoga Eggenfelden' } });

		expect(get(studiosStore)).toEqual([
			{
				registry: 'addr-a',
				program: '',
				studio: { name: 'Yoga Eggenfelden' },
				locations: [],
				courses: [],
				packages: []
			}
		]);
	});

	it('patches one without disturbing the other', () => {
		// Both replicate independently, and an update to one arriving while the
		// other is mid-sync must not blank it.
		updateStudio('addr-a', { studio: { name: 'A' }, courses: [{ _id: 'c1' }] });
		updateStudio('addr-b', { studio: { name: 'B' } });
		updateStudio('addr-a', { courses: [{ _id: 'c1' }, { _id: 'c2' }] });

		const studios = get(studiosStore);

		expect(studios).toHaveLength(2);
		expect(studios[0].courses).toHaveLength(2);
		expect(studios[0].studio).toEqual({ name: 'A' });
		expect(studios[1].studio).toEqual({ name: 'B' });
	});

	it('keeps the order they were joined in', () => {
		// The programme lists them one under the other, so the order is what a
		// student sees. Newest-first would move the studio somebody is looking at.
		updateStudio('addr-a', {});
		updateStudio('addr-b', {});

		expect(get(studiosStore).map((entry) => entry.registry)).toEqual(['addr-a', 'addr-b']);
	});
});
