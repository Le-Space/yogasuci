// The programme: courses and packages (docs/PLAN.md §3.2).
//
// Two course shapes share one document type. A `recurring` course is an open
// weekly drop-in class with an optional from/until window; a `series` course is
// a closed run that stores its **concrete sessions**, because the owner strikes
// holidays out of the generated proposal and what remains is the course.
//
// Packages are studio-wide on purpose: a ten-class pass bought at one location
// is redeemable at every location — that is the point of running more than one.

import { get, writable } from 'svelte/store';

import { openDocuments, readAll } from './open.js';
import { nodeStatusStore } from '../p2p/node.js';
import { seriesWindow } from '../program/sessions.js';

export const programDbStore = writable(/** @type {any} */ (null));
export const coursesStore = writable(/** @type {any[]} */ ([]));
export const packagesStore = writable(/** @type {any[]} */ ([]));
export const occupancyStore = writable(/** @type {any[]} */ ([]));

// See the note in registry.js: handles below a stopped node are dead, and
// clearing them here means no screen can hold one by accident.
nodeStatusStore.subscribe(({ state }) => {
	if (state !== 'idle') return;
	programDbStore.set(null);
	coursesStore.set([]);
	packagesStore.set([]);
	occupancyStore.set([]);
});

/**
 * @param {object} [options]
 * @param {string} [options.address] join an existing studio's programme
 */
export async function openProgram({ address } = {}) {
	const db = await openDocuments({ key: 'program', name: 'yoga-program', address });

	programDbStore.set(db);
	db.events.on('update', () => refreshProgram());
	await refreshProgram();

	return db;
}

export async function refreshProgram() {
	const db = get(programDbStore);
	if (!db) return;

	const documents = await readAll(db);

	coursesStore.set(documents.filter((doc) => doc.type === 'course'));
	packagesStore.set(documents.filter((doc) => doc.type === 'package'));
	occupancyStore.set(documents.filter((doc) => doc.type === 'occupancy'));
}

/**
 * Save an open weekly class.
 *
 * @param {object} course
 * @param {string} course.id
 * @param {string} course.locationId
 * @param {{ de: string, en: string }} course.title
 * @param {number} course.weekday 0 = Sunday … 6 = Saturday
 * @param {string} course.time `HH:MM`
 * @param {number} course.durationMin
 * @param {number} course.capacity
 * @param {string | null} [course.validFrom]
 * @param {string | null} [course.validUntil]
 * @param {boolean} [course.active]
 */
export async function saveRecurringCourse({
	id,
	locationId,
	title,
	weekday,
	time,
	durationMin,
	capacity,
	validFrom = null,
	validUntil = null,
	active = true
}) {
	const db = requireProgramDb();

	await db.put({
		_id: `course:${id}`,
		type: 'course',
		mode: 'recurring',
		locationId,
		title,
		weekday,
		time,
		durationMin,
		capacity,
		validFrom,
		validUntil,
		active
	});

	await refreshProgram();
}

/**
 * Save a closed course series.
 *
 * The validity window is **not** stored: it is derived from the first and last
 * session, so striking the last date also shortens the ticket that was sold
 * for it (docs/PLAN.md §3.2). Storing it would let the two drift apart.
 *
 * @param {object} course
 * @param {string} course.id
 * @param {string} course.locationId
 * @param {{ de: string, en: string }} course.title
 * @param {string} course.time
 * @param {number} course.durationMin
 * @param {number} course.capacity
 * @param {{ date: string }[]} course.sessions
 * @param {number} course.priceEUR
 * @param {boolean} [course.allowDropIn]
 * @param {boolean} [course.active]
 */
export async function saveSeriesCourse({
	id,
	locationId,
	title,
	time,
	durationMin,
	capacity,
	sessions,
	priceEUR,
	allowDropIn = true,
	active = true
}) {
	const db = requireProgramDb();

	await db.put({
		_id: `course:${id}`,
		type: 'course',
		mode: 'series',
		locationId,
		title,
		time,
		durationMin,
		capacity,
		sessions: [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1)),
		priceEUR,
		allowDropIn,
		active
	});

	await refreshProgram();
}

/**
 * Save a package. Single, week, ten, month and year passes are all the same
 * document with different parameters — `units: null` marks a time pass, which
 * logs attendance without deducting anything.
 *
 * @param {object} pkg
 * @param {string} pkg.id
 * @param {{ de: string, en: string }} pkg.name
 * @param {'single' | 'week' | 'ten' | 'month' | 'year'} pkg.kind
 * @param {number} pkg.priceEUR
 * @param {number | null} pkg.units
 * @param {number} pkg.validityDays
 * @param {'issue' | 'firstRedeem'} pkg.validityStart
 * @param {string | null} [pkg.saleFrom]
 * @param {string | null} [pkg.saleUntil]
 */
export async function savePackage({
	id,
	name,
	kind,
	priceEUR,
	units,
	validityDays,
	validityStart,
	saleFrom = null,
	saleUntil = null
}) {
	const db = requireProgramDb();

	await db.put({
		_id: `package:${id}`,
		type: 'package',
		name,
		kind,
		priceEUR,
		units,
		validityDays,
		validityStart,
		saleFrom,
		saleUntil
	});

	await refreshProgram();
}

/**
 * Retire a pass so it can no longer be sold.
 *
 * Deactivated rather than deleted, for the same reason as a course and one more:
 * every ticket ever sold names its `packageId`, and the cash report reads the
 * price and the name off the *sale*, not off the price list. Removing the
 * document would leave those sales pointing at nothing.
 *
 * This is also what makes a mistaken import recoverable. Correcting a price
 * means editing it; a pass that should never have existed is retired here, and
 * the sales it never made stay absent from the report.
 *
 * @param {string} packageId full `_id`
 */
export async function deactivatePackage(packageId) {
	const db = requireProgramDb();
	const existing = await db.get(packageId);
	if (!existing) throw new Error(`No package ${packageId}`);

	await db.put({ ...existing.value, active: false });
	await refreshProgram();
}

/**
 * Deactivate rather than delete — sold tickets reference the course, and a
 * dangling `courseId` would make a series ticket unredeemable.
 *
 * @param {string} courseId full `_id`
 */
export async function deactivateCourse(courseId) {
	const db = requireProgramDb();
	const existing = await db.get(courseId);
	if (!existing) throw new Error(`No course ${courseId}`);

	await db.put({ ...existing.value, active: false });
	await refreshProgram();
}

/**
 * The window a series ticket inherits when it is sold.
 *
 * @param {any} course
 * @returns {{ from: string | null, until: string | null }}
 */
export function courseWindow(course) {
	if (course?.mode === 'series') return seriesWindow(course.sessions ?? []);
	return { from: course?.validFrom ?? null, until: course?.validUntil ?? null };
}

/**
 * Pick the readable half of a `{ de, en }` field, falling back to the other
 * language rather than rendering nothing (docs/PLAN.md §7).
 *
 * @param {{ de?: string, en?: string } | string | null | undefined} value
 * @param {string} locale
 * @returns {string}
 */
export function localized(value, locale) {
	if (!value) return '';
	if (typeof value === 'string') return value;

	const preferred = locale.startsWith('de') ? value.de : value.en;
	return preferred || value.de || value.en || '';
}

function requireProgramDb() {
	const db = get(programDbStore);
	if (!db) throw new Error('The programme is not open.');
	return db;
}
