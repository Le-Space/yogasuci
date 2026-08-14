// Whether this device hands out short codes.
//
// A short code is the compact (v3) payload from the package: QWBP's binary
// packing for the connection parameters, with a signature over the packed bytes
// so the identity binding this application relies on survives. What it buys is
// not a sparser code but a *single* one — measured upstream at 266 characters
// against 1057, which is one static frame instead of five animated ones. At a
// counter that is a glance instead of holding a phone steady through a sequence.
//
// Off by default, and the reason is not that the format is unfinished. Upstream
// measured four of eight runs under load leaving both peers with an open stream
// that carried no bytes — no error, no dropped connection, simply nothing
// arriving — against zero of eight on the long payload. In a booking system that
// is the worst failure there is: two devices that look paired while the tickets
// sold on one never reach the other.
//
// So it is a choice a studio makes rather than one made for them, and it is kept
// here rather than in the connect screen because *reading* is not part of the
// choice at all. A peer accepts either format whatever this says, so a device
// with this off still scans a short code from anyone who has it on. This flag
// governs one direction only: what this device hands out.

const STORAGE_KEY = 'yogasuci:short-code';

/**
 * Whether to produce short codes on this device.
 *
 * Reads on every call rather than caching: two tabs are one studio, and a cached
 * answer would let the invite screen keep handing out the old format after the
 * setting was changed in the other tab.
 *
 * @returns {boolean}
 */
export function shortCodeEnabled() {
	if (typeof localStorage === 'undefined') return false;

	try {
		return localStorage.getItem(STORAGE_KEY) === 'on';
	} catch {
		// Storage can be denied outright — Safari in a locked-down configuration,
		// or a browser with cookies blocked. The answer then is the default, not a
		// crash on a screen whose job is to make a connection.
		return false;
	}
}

/**
 * @param {boolean} enabled
 */
export function setShortCodeEnabled(enabled) {
	if (typeof localStorage === 'undefined') return;

	try {
		if (enabled) localStorage.setItem(STORAGE_KEY, 'on');
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// As above: a device that cannot remember the setting can still use it for
		// this session, because the caller holds the value it just set.
	}
}
