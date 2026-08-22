import { describe, expect, it } from 'vitest';

import { classesOn, nextClassAfter } from './today.js';

// 2026-08-24 is a Monday; 2026-08-25 a Tuesday.
const MONDAY = '2026-08-24';
const TUESDAY = '2026-08-25';

const weekly = (over: Record<string, unknown> = {}) => ({
	_id: 'course:vinyasa',
	mode: 'recurring' as const,
	weekday: 1,
	time: '18:00',
	active: true,
	...over
});

const series = (dates: string[], over: Record<string, unknown> = {}) => ({
	_id: 'course:prevention',
	mode: 'series' as const,
	time: '09:00',
	active: true,
	sessions: dates.map((date) => ({ date })),
	...over
});

describe('what runs on a day', () => {
	it('takes a weekly class whose weekday matches', () => {
		expect(classesOn([weekly()], MONDAY)).toHaveLength(1);
		expect(classesOn([weekly()], TUESDAY)).toHaveLength(0);
	});

	it('leaves out a weekly class the day falls outside the window of', () => {
		// The window is half the answer and the easy half to forget: a course that
		// ended in July still matches every Monday for ever.
		expect(classesOn([weekly({ validUntil: '2026-08-01' })], MONDAY)).toHaveLength(0);
		expect(classesOn([weekly({ validFrom: '2026-09-01' })], MONDAY)).toHaveLength(0);
	});

	it('takes a series only on a date it actually has a session on', () => {
		expect(classesOn([series([MONDAY])], MONDAY)).toHaveLength(1);
		expect(classesOn([series([TUESDAY])], MONDAY)).toHaveLength(0);
	});

	it('leaves out a course that has been deactivated', () => {
		// Deactivated rather than deleted is the studio's way of retiring a course,
		// so the day view must honour it or a retired class reappears every week.
		expect(classesOn([weekly({ active: false })], MONDAY)).toHaveLength(0);
	});

	it('reads earliest first', () => {
		const evening = weekly({ _id: 'course:evening', time: '19:30' });
		const morning = weekly({ _id: 'course:morning', time: '07:00' });

		expect(classesOn([evening, morning], MONDAY).map((entry) => entry.course._id)).toEqual([
			'course:morning',
			'course:evening'
		]);
	});
});

describe('the next class when today has none', () => {
	it('finds tomorrow', () => {
		const tuesdayClass = weekly({ weekday: 2 });

		const next = nextClassAfter([tuesdayClass], MONDAY);

		expect(next?.date).toBe(TUESDAY);
		expect(next?.time).toBe('18:00');
	});

	it('looks past tomorrow', () => {
		const sundayClass = weekly({ weekday: 0 });

		expect(nextClassAfter([sundayClass], MONDAY)?.date).toBe('2026-08-30');
	});

	it('never answers with today', () => {
		// Otherwise the empty-day line would name the class that is not running.
		expect(nextClassAfter([weekly()], MONDAY)?.date).not.toBe(MONDAY);
	});

	it('says there is none rather than searching for ever', () => {
		// A studio that has stopped offering anything has no next class, and
		// walking the calendar to the end of time to establish that is a loop with
		// no reason to stop.
		expect(nextClassAfter([weekly({ validUntil: MONDAY })], MONDAY)).toBe(null);
		expect(nextClassAfter([], MONDAY)).toBe(null);
	});

	it('picks the soonest across both kinds of course', () => {
		const sundayClass = weekly({ weekday: 0 });
		const tuesdaySeries = series([TUESDAY]);

		expect(nextClassAfter([sundayClass, tuesdaySeries], MONDAY)?.course._id).toBe(
			'course:prevention'
		);
	});
});
