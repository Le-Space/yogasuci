import { describe, expect, it } from 'vitest';

import { bookingEndsOn, isPastBooking } from './booking-time.js';

const TODAY = '2026-08-24';

describe('a booking for one day', () => {
	it('is past once its day has gone by', () => {
		expect(isPastBooking({ date: '2026-08-23' }, null, TODAY)).toBe(true);
	});

	it('is still to come on the day itself', () => {
		// The case worth pinning. Somebody looking at their phone on the morning of
		// a class must find it under "coming up" — and comparing whole days cannot
		// know whether the class has already started.
		expect(isPastBooking({ date: TODAY }, null, TODAY)).toBe(false);
	});

	it('is still to come tomorrow', () => {
		expect(isPastBooking({ date: '2026-08-25' }, null, TODAY)).toBe(false);
	});

	it('compares across a year boundary rather than by number', () => {
		expect(isPastBooking({ date: '2025-12-31' }, null, '2026-01-01')).toBe(true);
		expect(isPastBooking({ date: '2026-01-01' }, null, '2025-12-31')).toBe(false);
	});
});

describe('a booking for a whole series', () => {
	const series = (dates: string[]) => ({
		mode: 'series',
		sessions: dates.map((date) => ({ date }))
	});

	it('ends with its last session, not its first', () => {
		const course = series(['2026-08-10', '2026-08-17', '2026-08-31']);
		expect(bookingEndsOn({ date: null }, course)).toBe('2026-08-31');
		expect(isPastBooking({ date: null }, course, TODAY)).toBe(false);
	});

	it('is past once the last session has gone by', () => {
		expect(isPastBooking({ date: null }, series(['2026-08-10', '2026-08-17']), TODAY)).toBe(true);
	});

	it('reads the sessions in date order, not in stored order', () => {
		// They are stored as the owner edited them, which is not sorted.
		const course = series(['2026-08-31', '2026-08-10', '2026-08-17']);
		expect(bookingEndsOn({ date: null }, course)).toBe('2026-08-31');
	});
});

describe('when the end cannot be established', () => {
	// Unknown is not the same as over, and this is the difference that decides
	// whether a booking quietly disappears into "past" or stays where its owner
	// can see it.

	it('keeps a booking whose course has not arrived yet', () => {
		expect(isPastBooking({ date: null }, null, TODAY)).toBe(false);
		expect(bookingEndsOn({ date: null }, null)).toBe(null);
	});

	it('keeps a series booking whose sessions have not replicated', () => {
		expect(isPastBooking({ date: null }, { mode: 'series', sessions: [] }, TODAY)).toBe(false);
	});

	it('falls back to the offer window for a recurring course booked whole', () => {
		const course = { mode: 'recurring', validUntil: '2026-08-01' };
		expect(isPastBooking({ date: null }, course, TODAY)).toBe(true);
	});

	it('survives a booking that is missing entirely', () => {
		expect(isPastBooking(null, null, TODAY)).toBe(false);
		expect(isPastBooking(undefined, undefined, TODAY)).toBe(false);
	});
});
