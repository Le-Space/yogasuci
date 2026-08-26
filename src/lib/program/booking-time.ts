// Which side of today a booking falls on.
//
// Pure and UI-free, for the reason the session generator gives: this is date
// arithmetic with an awkward case in it, and awkward cases belong in a unit
// test rather than in a screen somebody has to click through.
//
// The awkward case is a booking for a whole series. It carries no date of its
// own — booking a series books all of it — so "is it over" is a question about
// the course, not about the booking. The last session answers it.

import { seriesWindow, type IsoDate, type SeriesSession } from './sessions.js';

export interface BookingLike {
	/** The day booked, or null/absent for a whole series. */
	date?: IsoDate | null;
}

export interface CourseLike {
	mode?: string;
	sessions?: SeriesSession[];
	validUntil?: IsoDate | null;
}

/**
 * The last day this booking still concerns, or `null` when that cannot be
 * established.
 *
 * Null is not the same as "over". A series whose course has not replicated yet
 * has no sessions to read, and a booking whose course was deleted has no course
 * at all — in both cases the honest answer is "unknown", and `isPastBooking`
 * treats unknown as still to come rather than filing it away.
 */
export function bookingEndsOn(
	booking: BookingLike | null | undefined,
	course?: CourseLike | null
): IsoDate | null {
	if (booking?.date) return booking.date;

	if (course?.mode === 'series') return seriesWindow(course.sessions ?? []).until;

	// A recurring course booked as a whole — not something the app offers today,
	// but the shape allows it, and `validUntil` is the field that would say when
	// it stops.
	return course?.validUntil ?? null;
}

/**
 * Has the last day this booking concerns already gone by?
 *
 * A class **today** counts as still to come. Somebody looking at their phone on
 * the morning of a class should find it under "coming up", and a comparison on
 * whole days cannot know whether 09:00 has passed anyway. Filing today's class
 * under "past" at breakfast would be wrong in the way that matters.
 *
 * @param today the current day as `YYYY-MM-DD`; passed in rather than read from
 *   the clock so this stays a function of its arguments.
 */
export function isPastBooking(
	booking: BookingLike | null | undefined,
	course: CourseLike | null | undefined,
	today: IsoDate
): boolean {
	const ends = bookingEndsOn(booking, course);
	if (!ends) return false;

	// ISO dates sort as strings — that is the whole reason for the format.
	return ends < today;
}
