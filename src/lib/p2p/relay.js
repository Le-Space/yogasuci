// Whether this device may use a relay, and the promise that survives it saying
// yes.
//
// Two phones in a studio meet by holding one up, and that is the default and
// stays it. What it cannot do is connect two people who are not in the same
// room: with a symmetric NAT on both sides no invitation of any age would
// succeed, and a code carried over a messenger connects nothing (LIMITS.md
// §1.2). A relay answers that, and only that.
//
// Off is not merely the default here, it is a stronger statement: without this
// switch the node has no bootstrap list, announces no `/p2p-circuit`, and its
// `denyDialMultiaddr` refuses every address that is not a QR session — so a
// device that never turns this on makes no outbound call at all, which is
// checked in libp2p-config.spec.js rather than promised in prose.
//
// What saying yes costs, and it belongs here rather than buried: the relay
// learns that two peers want each other, and it learns their IP addresses. It
// does not learn what they exchange.

const STORAGE_KEY = 'yogasuci:relay';

/**
 * Whether a relay may be used on this device.
 *
 * Read on every call rather than cached, like the short-code setting: two tabs
 * are one device, and a cached answer would let one of them go on refusing to
 * dial after the other was allowed to.
 *
 * @returns {boolean}
 */
export function relayEnabled() {
	if (typeof localStorage === 'undefined') return false;

	try {
		return localStorage.getItem(STORAGE_KEY) === 'on';
	} catch {
		// Storage denied — Safari locked down, cookies blocked. The answer is the
		// default, which is the safe one here rather than merely the quiet one.
		return false;
	}
}

/**
 * @param {boolean} enabled
 */
export function setRelayEnabled(enabled) {
	if (typeof localStorage === 'undefined') return;

	try {
		if (enabled) localStorage.setItem(STORAGE_KEY, 'on');
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// As above. The caller holds the value it just set, so this session behaves
		// as asked even when nothing can be written down.
	}
}
