// Which build this is.
//
// Not a nicety on a P2P app. There is no server to ask what version a studio is
// running, and no way to push one: a device runs whatever it last installed, and
// a PWA can sit on a cached build for weeks. When a studio says "the passes do
// not arrive", the first useful question is which build each device is on — and
// until now the honest answer was that nobody could tell, not even the person
// holding the device.
//
// Three facts, and each earns its place. The **version** is what a release note
// can be written against — a tag, cut when there is something to tell a studio,
// so it is absent rather than invented between releases. The **commit** is what
// a fix can be traced to, and it is the field that always answers. The **build
// time** is what tells a studio whether their device took an update at all — the
// number that moves even when the other two do not.

/**
 * The last release this build is at or past — `v0.2.0`, `v0.2.0+7`, or `''`.
 *
 * Fixed at build time by vite (see `define` in vite.config.js), so this reports
 * the build the device is actually running rather than whatever the repository
 * looks like now.
 *
 * Carries its own `v`, because it is a tag name rather than a number. Empty
 * until the first tag exists, and empty is a valid answer: see
 * scripts/build-version.mjs for why a standing `0.1.0` was worse than none.
 */
export const version = __APP_VERSION__;

/** Short SHA, or '' for a build made outside a git checkout. */
export const commit = __COMMIT__;

/** ISO 8601, in UTC. */
export const builtAt = __BUILD_DATE__;

/**
 * The stamp as one line, in the reader's own time zone.
 *
 * Local time rather than the stored UTC: this is read by somebody comparing a
 * device against what they remember doing to it this morning, and a Z-suffixed
 * timestamp makes them do the arithmetic. The commit drops out when there is
 * none, because printing "unknown" is worse than printing nothing.
 *
 * @param {object} [options]
 * @param {string} [options.locale] BCP 47, for the date format
 * @returns {string}
 */
export function buildStamp({ locale = 'de' } = {}) {
	const at = new Date(builtAt);
	const when = Number.isNaN(at.getTime())
		? builtAt
		: at.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

	// `version` already carries its `v`; adding one here would print `vv0.2.0` the
	// day a tag lands, which nobody would see until then.
	return [version, commit, when].filter(Boolean).join(' · ');
}
