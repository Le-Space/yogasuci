// What runs today, and what runs next when nothing does.
//
// The programme lists every course a studio offers. Somebody standing in the
// doorway wants one of them: the one that is on now. Everything needed to
// answer that was already here — `nextOccurrence` for weekly classes, the dated
// sessions for a series — and nothing asked (#76).
//
// Pure, and next to `sessions.ts` for the same reason: this is date arithmetic
// across weekday and window boundaries, which is exactly the sort of thing that
// should be proven in a unit test rather than clicked through on whichever day
// of the week somebody happens to be working.

import { addDays, nextOccurrence, type IsoDate } from './sessions.js';

/** The two shapes a course takes, reduced to what a day view needs. */
export interface DayCourse {
	_id?: string;
	mode?: 'recurring' | 'series';
	active?: boolean;
	weekday?: number;
	time?: string;
	validFrom?: IsoDate | null;
	validUntil?: IsoDate | null;
	sessions?: { date: IsoDate }[];
}

/** A course together with the day it runs. */
export interface Occurrence<T> {
	course: T;
	date: IsoDate;
	time: string;
}

/**
 * Whether one course runs on `date`.
 *
 * A weekly class runs when its weekday matches *and* the day falls inside its
 * validity window — `nextOccurrence` answers both at once, so this asks it
 * rather than re-deriving the second half and getting it subtly different.
 */
function runsOn(course: DayCourse, date: IsoDate): boolean {
	if (course.active === false) return false;

	if (course.mode === 'series') {
		return (course.sessions ?? []).some((session) => session.date === date);
	}

	if (typeof course.weekday !== 'number') return false;

	return (
		nextOccurrence(
			{
				weekday: course.weekday as Parameters<typeof nextOccurrence>[0]['weekday'],
				validFrom: course.validFrom,
				validUntil: course.validUntil
			},
			date
		) === date
	);
}

/**
 * The classes on `date`, earliest first.
 *
 * Sorted by time because that is the order somebody reads them in — a day view
 * whose first row is the evening class is a list, not an answer.
 */
export function classesOn<T extends DayCourse>(courses: T[], date: IsoDate): Occurrence<T>[] {
	return courses
		.filter((course) => runsOn(course, date))
		.map((course) => ({ course, date, time: course.time ?? '' }))
		.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/**
 * The next class strictly after `date`, or null when nothing is scheduled.
 *
 * An empty day is a real answer, but a poor one: "nothing today" leaves
 * somebody to open the full programme and work out the next date themselves.
 * Told instead, it is the same information one step further on.
 *
 * Bounded at `withinDays` rather than searching forever. A studio that has
 * stopped offering anything has no next class, and walking the calendar to the
 * end of time to establish that would be a loop with no reason to stop.
 */
export function nextClassAfter<T extends DayCourse>(
	courses: T[],
	date: IsoDate,
	withinDays = 28
): Occurrence<T> | null {
	for (let ahead = 1; ahead <= withinDays; ahead++) {
		const day = addDays(date, ahead);
		const [first] = classesOn(courses, day);
		if (first) return first;
	}

	return null;
}
