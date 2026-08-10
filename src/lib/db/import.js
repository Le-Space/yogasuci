// Reading a studio's programme out of a document somebody pasted in.
//
// The document is expected to come from an assistant that read the studio's own
// website (see the handbook), which decides everything about how this behaves:
// it is **untrusted, well-meaning input**. Not hostile, but confidently wrong in
// ways a schema cannot catch — a price list that says "10er-Karte (1 Jahr
// gültig): 175,-€" can come back as 17.50, or as ten units with no validity at
// all, and both parse perfectly.
//
// So this module never writes. It produces a *plan*: what would be created, what
// already exists, and what was refused and why. The writing happens after a
// person has looked at it, which is the only place that class of error can be
// caught while it is still cheap.
//
// Two things it will not do, both deliberate:
//
//   - It does not touch ticket ledgers, redemptions, bookings or the device
//     registry. Setup is the programme and the price list, which the studio
//     authors anyway. Nothing an assistant produced may reach a signed log.
//   - It does not accept `_id`. Ids are minted here from a slug, so a document
//     cannot aim itself at an existing course by naming it.

/** The marker a setup document has to carry. Not the export format. */
export const SETUP_FORMAT = 'yogasuci/setup/1';

/** Validity windows the ledger understands (see src/lib/ledger/types.ts). */
export const VALIDITY_STARTS = ['issue', 'firstRedeem'];

/**
 * Places per course when the document does not say.
 *
 * A studio website publishes its timetable, not its room size — "Mo 18:00
 * Hatha", never "20 places". Refusing a course for a number that is nowhere on
 * the page meant the import dropped almost every course while passing the
 * prices, which is backwards: the prices are facts from the page, the capacity
 * is a decision the studio makes anyway.
 *
 * Twelve because that is what the programme editor already starts a new course
 * with. Marked as assumed so the review screen can say so rather than present
 * it as read.
 */
export const DEFAULT_CAPACITY = 12;

/** Package kinds the programme editor offers. */
export const PACKAGE_KINDS = ['single', 'day', 'week', 'ten', 'month', 'year'];

/**
 * @typedef {object} Refusal
 * @property {string} what a name the reader will recognise from their own page
 * @property {string} reason plain language, aimed at the studio owner
 */

/**
 * @typedef {object} Plan
 * @property {any[]} locations
 * @property {any[]} packages
 * @property {any[]} courses
 * @property {{ kind: string, id: string, name: string }[]} existing
 * @property {Refusal[]} refused
 * @property {string | null} source where the document says it came from
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>} a predicate rather than a boolean,
 *   so reading a field off a checked value does not need a cast at every use
 */
function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A stable id from a human name.
 *
 * Minted rather than taken from the document, so a pasted file cannot address an
 * existing entry by choosing its id.
 *
 * @param {string} value
 */
export function slugify(value) {
	return String(value)
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

/**
 * Localised text, tolerating a bare string.
 *
 * An assistant asked for `{de, en}` will sometimes return one string. Refusing
 * that would be pedantry: the studio can translate later, and a missing
 * translation is visible in the editor.
 *
 * @param {unknown} value
 * @returns {{ de: string, en: string } | null}
 */
function readName(value) {
	if (typeof value === 'string' && value.trim()) {
		const text = value.trim();
		return { de: text, en: text };
	}

	if (isPlainObject(value)) {
		const de = typeof value.de === 'string' ? value.de.trim() : '';
		const en = typeof value.en === 'string' ? value.en.trim() : '';
		if (de || en) return { de: de || en, en: en || de };
	}

	return null;
}

/**
 * A price in euro.
 *
 * Accepts a number or the string forms a price list actually uses — "175,-€",
 * "22,- €", "9.50". Deliberately does **not** guess at a missing decimal
 * separator: a bare "175" is 175 euro, never 1.75.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function readPrice(value) {
	if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;

	if (typeof value !== 'string') return null;

	const cleaned = value.replace(/[€\s]/g, '').replace(/,-$/, '').replace(',', '.');
	const parsed = Number.parseFloat(cleaned);

	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** @param {unknown} value */
function readPositiveInt(value) {
	const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Turn a pasted setup document into a plan.
 *
 * Never throws on bad content: a document that is wrong in twelve places should
 * report twelve refusals, not the first one. It throws only when the input is
 * not a setup document at all, because there is nothing to review then.
 *
 * @param {unknown} document parsed JSON
 * @param {object} [current] what the studio already has, so the plan can say so
 * @param {{ _id: string }[]} [current.locations]
 * @param {{ _id: string }[]} [current.packages]
 * @param {{ _id: string }[]} [current.courses]
 * @returns {Plan}
 */
export function planImport(document, current = {}) {
	if (!isPlainObject(document)) {
		throw new Error('That is not a setup document — expected a single JSON object.');
	}

	if (document.format !== SETUP_FORMAT) {
		throw new Error(
			`Expected a ${SETUP_FORMAT} document. Check that the whole answer was copied, without any text around it.`
		);
	}

	/** @type {Plan} */
	const plan = {
		locations: [],
		packages: [],
		courses: [],
		existing: [],
		refused: [],
		source: typeof document.source === 'string' ? document.source : null
	};

	const have = {
		location: new Set((current.locations ?? []).map((entry) => entry._id)),
		package: new Set((current.packages ?? []).map((entry) => entry._id)),
		course: new Set((current.courses ?? []).map((entry) => entry._id))
	};

	/**
	 * @param {'location' | 'package' | 'course'} kind
	 * @param {string} id
	 * @param {string} name
	 */
	function alreadyHere(kind, id, name) {
		if (!have[kind].has(`${kind}:${id}`)) return false;
		plan.existing.push({ kind, id, name });
		return true;
	}

	// --- locations ---------------------------------------------------------
	for (const entry of Array.isArray(document.locations) ? document.locations : []) {
		const name = readName(isPlainObject(entry) ? entry.name : null);
		if (!name) {
			plan.refused.push({ what: 'a location', reason: 'it has no name' });
			continue;
		}

		const id = slugify(isPlainObject(entry) && entry.id ? String(entry.id) : name.de);
		if (!id) {
			plan.refused.push({ what: name.de, reason: 'its name produces no usable id' });
			continue;
		}
		if (alreadyHere('location', id, name.de)) continue;

		// The postal address comes along. A studio's site always has one, the
		// location form has a field for it, and leaving it behind means retyping
		// the one thing the website states most plainly.
		const address =
			isPlainObject(entry) && typeof entry.address === 'string' ? entry.address.trim() : '';

		plan.locations.push({ id, name, address });
	}

	// --- packages ----------------------------------------------------------
	for (const entry of Array.isArray(document.packages) ? document.packages : []) {
		if (!isPlainObject(entry)) continue;

		const name = readName(entry.name);
		if (!name) {
			plan.refused.push({ what: 'a pass', reason: 'it has no name' });
			continue;
		}

		const priceEUR = readPrice(entry.priceEUR ?? entry.price);
		if (priceEUR === null) {
			plan.refused.push({ what: name.de, reason: 'its price could not be read' });
			continue;
		}

		// A pass is either units or time. Both empty is not a pass, and guessing
		// which was meant is exactly the guess that costs a studio money.
		const units =
			entry.units === null || entry.units === undefined ? null : readPositiveInt(entry.units);
		const validityDays =
			entry.validityDays === null || entry.validityDays === undefined
				? null
				: readPositiveInt(entry.validityDays);

		// Order matters: a value that was *given* and is unusable gets the precise
		// reason. Falling through to "neither was given" would tell the reader
		// their pass says nothing, when it in fact says 2.5 visits.
		if (entry.units !== null && entry.units !== undefined && units === null) {
			plan.refused.push({
				what: name.de,
				reason: 'its number of visits is not a whole number above zero'
			});
			continue;
		}

		if (entry.validityDays !== null && entry.validityDays !== undefined && validityDays === null) {
			plan.refused.push({
				what: name.de,
				reason: 'its validity is not a whole number of days above zero'
			});
			continue;
		}

		if (units === null && validityDays === null) {
			plan.refused.push({
				what: name.de,
				reason: 'it says neither how many visits it holds nor how long it lasts'
			});
			continue;
		}

		const validityStart = VALIDITY_STARTS.includes(String(entry.validityStart))
			? String(entry.validityStart)
			: 'issue';

		const kind = PACKAGE_KINDS.includes(String(entry.kind)) ? String(entry.kind) : 'single';

		const id = slugify(entry.id ? String(entry.id) : name.de);
		if (!id) {
			plan.refused.push({ what: name.de, reason: 'its name produces no usable id' });
			continue;
		}
		if (alreadyHere('package', id, name.de)) continue;

		plan.packages.push({
			id,
			name,
			kind,
			priceEUR,
			units,
			validityDays,
			validityStart,
			saleFrom: typeof entry.saleFrom === 'string' ? entry.saleFrom : null,
			saleUntil: typeof entry.saleUntil === 'string' ? entry.saleUntil : null
		});
	}

	// --- courses -----------------------------------------------------------
	for (const entry of Array.isArray(document.courses) ? document.courses : []) {
		if (!isPlainObject(entry)) continue;

		const title = readName(entry.title ?? entry.name);
		if (!title) {
			plan.refused.push({ what: 'a course', reason: 'it has no title' });
			continue;
		}

		const locationId = entry.locationId ? slugify(String(entry.locationId)) : null;
		if (!locationId) {
			plan.refused.push({ what: title.de, reason: 'it names no location' });
			continue;
		}

		// Not a reason to refuse: see DEFAULT_CAPACITY. A course whose places we
		// had to assume is still a course, and the number is editable before
		// anything is written.
		const readCapacity = readPositiveInt(entry.capacity);
		const capacity = readCapacity ?? DEFAULT_CAPACITY;
		const capacityAssumed = readCapacity === null;

		const durationMin = readPositiveInt(entry.durationMin) ?? 90;
		const time =
			typeof entry.time === 'string' && /^\d{2}:\d{2}$/.test(entry.time) ? entry.time : null;
		if (!time) {
			plan.refused.push({ what: title.de, reason: 'it gives no start time as HH:MM' });
			continue;
		}

		const id = slugify(entry.id ? String(entry.id) : title.de);
		if (!id) {
			plan.refused.push({ what: title.de, reason: 'its title produces no usable id' });
			continue;
		}
		if (alreadyHere('course', id, title.de)) continue;

		if (entry.mode === 'series') {
			const sessions = (Array.isArray(entry.sessions) ? entry.sessions : []).filter(
				(session) => isPlainObject(session) && /^\d{4}-\d{2}-\d{2}$/.test(String(session.date))
			);

			if (!sessions.length) {
				plan.refused.push({
					what: title.de,
					reason: 'a course block needs its dates, and none were readable'
				});
				continue;
			}

			const priceEUR = readPrice(entry.priceEUR ?? entry.price);
			if (priceEUR === null) {
				plan.refused.push({
					what: title.de,
					reason: 'a course block needs a price, and it could not be read'
				});
				continue;
			}

			plan.courses.push({
				id,
				mode: 'series',
				locationId,
				title,
				time,
				durationMin,
				capacity,
				capacityAssumed,
				sessions,
				priceEUR,
				allowDropIn: entry.allowDropIn !== false
			});
			continue;
		}

		const weekday = readPositiveInt(entry.weekday) ?? (entry.weekday === 0 ? 0 : null);
		if (weekday === null || weekday > 6) {
			plan.refused.push({ what: title.de, reason: 'it gives no weekday between 0 and 6' });
			continue;
		}

		plan.courses.push({
			id,
			mode: 'recurring',
			locationId,
			title,
			weekday,
			time,
			durationMin,
			capacity,
			capacityAssumed,
			validFrom: typeof entry.validFrom === 'string' ? entry.validFrom : null,
			validUntil: typeof entry.validUntil === 'string' ? entry.validUntil : null
		});
	}

	// --- what this app has no home for -------------------------------------
	// Named rather than dropped. A studio that listed its teachers should be told
	// they were not imported, not left to discover it.
	if (Array.isArray(document.teachers) && document.teachers.length) {
		plan.refused.push({
			what: document.teachers.length === 1 ? '1 teacher' : `${document.teachers.length} teachers`,
			reason: 'this app has no teacher directory yet — a course records a title, a place and a time'
		});
	}

	return plan;
}

/**
 * Read a pasted string.
 *
 * Assistants like to wrap JSON in prose or a code fence, and "unexpected token
 * ```" helps nobody. Pull the object out when it is obviously there, and say
 * something usable when it is not.
 *
 * @param {string} text
 * @returns {unknown}
 */
export function parseSetupText(text) {
	const trimmed = String(text ?? '').trim();
	if (!trimmed) throw new Error('Nothing was pasted.');

	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1].trim() : trimmed;

	try {
		return JSON.parse(candidate);
	} catch {
		const start = candidate.indexOf('{');
		const end = candidate.lastIndexOf('}');

		if (start !== -1 && end > start) {
			try {
				return JSON.parse(candidate.slice(start, end + 1));
			} catch {
				// fall through to the message below
			}
		}

		throw new Error(
			'That could not be read as JSON. Copy the whole answer, including the opening and closing brace, and nothing else.'
		);
	}
}
