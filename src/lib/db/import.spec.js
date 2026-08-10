// The fixture is real. It is the price list at muenchen.sivananda.yoga/preise/,
// which was chosen as the example precisely because it is messier than anything
// invented would have been: four parallel price tiers for the same pass, a pass
// that can only be bought in July and August, a workshop that costs "22 € or one
// strip off a card", and teachers the app has no home for.
//
// Every refusal below corresponds to something on that page. That is the point of
// the tests: not that the parser accepts good input, but that it names what it
// cannot take rather than quietly producing a plausible programme.

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_CAPACITY,
	parseSetupText,
	planImport,
	readPrice,
	SETUP_FORMAT,
	slugify
} from './import.js';

/** As an assistant would return it, reading the Sivananda price list. */
const SIVANANDA = {
	format: SETUP_FORMAT,
	source: 'https://muenchen.sivananda.yoga/preise/',
	locations: [
		{
			id: 'luisenstrasse',
			name: { de: 'Luisenstraße 45', en: 'Luisenstrasse 45' },
			address: 'Luisenstraße 45, 80333 München'
		}
	],
	packages: [
		{
			id: 'drop-in',
			name: { de: 'Drop-In Yogastunde', en: 'Drop-in class' },
			kind: 'single',
			priceEUR: '20,-€',
			units: 1,
			validityDays: null,
			validityStart: 'issue'
		},
		{
			id: 'zehner',
			name: { de: '10er-Karte', en: '10-class pass' },
			kind: 'ten',
			priceEUR: '175,-€',
			units: 10,
			validityDays: 365,
			validityStart: 'issue'
		},
		{
			id: 'monatskarte',
			name: { de: 'Monatskarte', en: 'Monthly pass' },
			kind: 'month',
			priceEUR: 120,
			units: null,
			validityDays: 30,
			validityStart: 'issue'
		},
		{
			// Only sold in July and August — the programme editor already carries
			// saleFrom/saleUntil, so this survives the import intact.
			id: 'sommerpass',
			name: { de: 'Sommerpass', en: 'Summer pass' },
			kind: 'ten',
			priceEUR: 110,
			units: 10,
			validityDays: 365,
			validityStart: 'issue',
			saleFrom: '2026-07-01',
			saleUntil: '2026-08-31'
		}
	],
	courses: [
		{
			id: 'anfaenger-abend',
			mode: 'recurring',
			locationId: 'luisenstrasse',
			title: { de: 'Anfängerkurs', en: 'Beginners class' },
			weekday: 5,
			time: '18:00',
			durationMin: 90,
			capacity: 20
		}
	],
	teachers: [{ name: 'Swami Vishnudevananda' }]
};

describe('planImport with the Sivananda price list', () => {
	it('takes the passes that map cleanly, prices and all', () => {
		const plan = planImport(SIVANANDA);

		expect(plan.packages).toHaveLength(4);
		expect(plan.packages.map((p) => p.priceEUR)).toEqual([20, 175, 120, 110]);
	});

	it('keeps the sale window of a pass sold only in summer', () => {
		const plan = planImport(SIVANANDA);
		const summer = plan.packages.find((p) => p.id === 'sommerpass');

		expect(summer?.saleFrom).toBe('2026-07-01');
		expect(summer?.saleUntil).toBe('2026-08-31');
	});

	it('says the teachers were not imported instead of dropping them', () => {
		// The studio lists its teachers on the page. There is no teacher directory
		// here, and silently ignoring them is how somebody discovers it in week
		// three rather than on the review screen.
		const plan = planImport(SIVANANDA);

		expect(plan.refused.map((r) => r.what)).toContain('1 teacher');
	});

	it('brings the postal address along rather than making it be retyped', () => {
		// The one thing a studio website states most plainly, and the location form
		// has a field for it.
		expect(planImport(SIVANANDA).locations[0].address).toBe('Luisenstraße 45, 80333 München');
	});

	it('records where the document came from', () => {
		expect(planImport(SIVANANDA).source).toBe('https://muenchen.sivananda.yoga/preise/');
	});
});

describe('the places a website never publishes', () => {
	/** A timetable line as it appears on a real site: day, time, title. No room size. */
	const TIMETABLE_COURSE = {
		format: SETUP_FORMAT,
		courses: [
			{
				mode: 'recurring',
				locationId: 'luisenstrasse',
				title: 'Hatha Yoga',
				weekday: 1,
				time: '18:00'
			}
		]
	};

	it('keeps a course that gives no number of places', () => {
		// This is the whole point of the change. A studio site says "Mon 18:00
		// Hatha", never "20 places", and the prompt forbids inventing what the page
		// does not say — so requiring it meant refusing nearly every course while
		// the prices sailed through. Backwards: the price is a fact from the page,
		// the capacity is a decision the studio makes anyway.
		const plan = planImport(TIMETABLE_COURSE);

		expect(plan.courses).toHaveLength(1);
		expect(plan.refused).toEqual([]);
	});

	it('marks the number as assumed rather than presenting it as read', () => {
		const [course] = planImport(TIMETABLE_COURSE).courses;

		expect(course.capacity).toBe(DEFAULT_CAPACITY);
		expect(course.capacityAssumed).toBe(true);
	});

	it('does not mark a number the page actually gave', () => {
		const plan = planImport({
			format: SETUP_FORMAT,
			courses: [{ ...TIMETABLE_COURSE.courses[0], capacity: 20 }]
		});

		expect(plan.courses[0].capacity).toBe(20);
		expect(plan.courses[0].capacityAssumed).toBe(false);
	});

	it('falls back rather than losing a course over an unreadable number', () => {
		// "max. 20 Teilnehmer" that came back as a phrase. Dropping the course
		// costs more than assuming a number the studio can see and correct.
		const plan = planImport({
			format: SETUP_FORMAT,
			courses: [{ ...TIMETABLE_COURSE.courses[0], capacity: 'viele' }]
		});

		expect(plan.courses).toHaveLength(1);
		expect(plan.courses[0].capacityAssumed).toBe(true);
	});
});

describe('what it refuses rather than guesses', () => {
	/** @param {any} extra */
	const withPackage = (extra) => ({
		format: SETUP_FORMAT,
		packages: [{ name: 'Karte', priceEUR: 10, ...extra }]
	});

	it('refuses a pass that is neither a number of visits nor a length of time', () => {
		// "Workshop: 22 € oder 1 Streifen" reduces to this when an assistant cannot
		// decide what it is. Inventing "probably one visit" would put a wrong pass
		// on sale.
		const plan = planImport(withPackage({ units: null, validityDays: null }));

		expect(plan.packages).toHaveLength(0);
		expect(plan.refused[0].reason).toMatch(/neither how many visits/);
	});

	it('refuses a fractional number of visits rather than rounding it', () => {
		const plan = planImport(withPackage({ units: 2.5 }));

		expect(plan.packages).toHaveLength(0);
		expect(plan.refused[0].reason).toMatch(/whole number/);
	});

	it('refuses a pass whose price it cannot read', () => {
		const plan = planImport({
			format: SETUP_FORMAT,
			packages: [{ name: 'Karte', priceEUR: 'auf Anfrage', units: 10 }]
		});

		expect(plan.refused[0].reason).toMatch(/price/);
	});

	it('reports every problem, not just the first', () => {
		const plan = planImport({
			format: SETUP_FORMAT,
			packages: [{ name: 'A', priceEUR: 'x', units: 1 }, { name: 'B' }, { priceEUR: 5 }]
		});

		expect(plan.refused).toHaveLength(3);
	});

	it('refuses a course block with no dates', () => {
		const plan = planImport({
			format: SETUP_FORMAT,
			courses: [
				{
					mode: 'series',
					locationId: 'x',
					title: 'Kurs',
					time: '18:00',
					capacity: 10,
					priceEUR: 90,
					sessions: []
				}
			]
		});

		expect(plan.courses).toHaveLength(0);
		expect(plan.refused[0].reason).toMatch(/dates/);
	});
});

describe('prices, where being wrong costs money', () => {
	it('reads the forms a German price list actually uses', () => {
		expect(readPrice('175,-€')).toBe(175);
		expect(readPrice('22,- €')).toBe(22);
		expect(readPrice('9,50')).toBe(9.5);
		expect(readPrice(20)).toBe(20);
	});

	it('never invents a decimal separator', () => {
		// 175 is a hundred and seventy-five euro. A parser clever enough to read it
		// as 1.75 would be wrong in the direction nobody notices until the cash
		// report.
		expect(readPrice('175')).toBe(175);
	});

	it('rejects a negative price', () => {
		expect(readPrice(-5)).toBeNull();
		expect(readPrice('auf Anfrage')).toBeNull();
	});
});

describe('what a document may not decide for itself', () => {
	it('mints ids from names rather than taking them', () => {
		expect(slugify('10er-Karte für Kursteilnehmer')).toBe('10er-karte-fuer-kursteilnehmer');
		expect(slugify('Luisenstraße 45')).toBe('luisenstrasse-45');
	});

	it('cannot aim at an existing entry by choosing its id', () => {
		// `_id` is ignored entirely: the id comes from `id`/name through slugify,
		// and the `package:` prefix is added when writing. A document cannot
		// address `package:zehner` by writing it out.
		const plan = planImport({
			format: SETUP_FORMAT,
			packages: [{ _id: 'package:zehner', name: 'Etwas anderes', priceEUR: 5, units: 1 }]
		});

		expect(plan.packages[0].id).toBe('etwas-anderes');
	});

	it('reports an entry that already exists instead of overwriting it', () => {
		const plan = planImport(SIVANANDA, { packages: [{ _id: 'package:zehner' }] });

		expect(plan.packages.map((p) => p.id)).not.toContain('zehner');
		expect(plan.existing).toEqual([{ kind: 'package', id: 'zehner', name: '10er-Karte' }]);
	});

	it('refuses anything that is not a setup document', () => {
		expect(() => planImport({ format: 'yoga-p2p/export/1' })).toThrow(/yogasuci\/setup\/1/);
		expect(() => planImport('a string')).toThrow(/not a setup document/);
	});
});

describe('parseSetupText, because assistants wrap things', () => {
	it('reads a fenced code block', () => {
		const text =
			'Sure, here you go:\n\n```json\n{"format":"yogasuci/setup/1"}\n```\n\nLet me know!';

		expect(parseSetupText(text)).toEqual({ format: SETUP_FORMAT });
	});

	it('reads an object with prose around it', () => {
		expect(parseSetupText('Here it is: {"format":"yogasuci/setup/1"} — hope that helps')).toEqual({
			format: SETUP_FORMAT
		});
	});

	it('says something usable when there is no JSON at all', () => {
		expect(() => parseSetupText('I could not access that website.')).toThrow(
			/could not be read as JSON/
		);
		expect(() => parseSetupText('   ')).toThrow(/Nothing was pasted/);
	});
});
