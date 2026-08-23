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

import { multiaddr } from '@multiformats/multiaddr';

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

/**
 * The relays this app knows about, in the order they are tried.
 *
 * Baked in rather than discovered, because discovery needs a relay to begin
 * with. Four entries for one machine on purpose: the 2n6 name and the AutoTLS
 * name reach it by different routes, and each over v4 and v6 — a studio behind
 * an IPv6-only network and one behind IPv4-only both need a way in, and a
 * failure of one route should not be a failure of the relay.
 *
 * They age, and that is not a flaw to hide: a redeployed relay gets a new peer
 * id and a new 2n6 name, and a baked address then points at a proxy with no
 * backend behind it — which answers 503 and looks exactly like a machine that
 * is gone. That is why `relayAddress()` exists and why the screen offers a
 * field: whoever runs their own relay, or knows the current one, should not
 * have to wait for a release.
 *
 * Verified reachable at the time of writing: `/health` reported
 * `12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh` on 0.10.7.
 */
const BAKED_IN = Object.freeze([
	'/dns4/improve-empty-grass-tent.2n6.me/tcp/443/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh',
	'/dns6/improve-empty-grass-tent.2n6.me/tcp/443/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh',
	'/dns4/62-141-40-252.k51qzi5uqu5dk0apg1nrbtzlpkb8er9b2tc8t6a7c4jtnhe8t71ooa3053ppl0.libp2p.direct/tcp/45841/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh',
	'/dns6/2001-4ba0-ffe7-348-3-7209-2597-efa1.k51qzi5uqu5dk0apg1nrbtzlpkb8er9b2tc8t6a7c4jtnhe8t71ooa3053ppl0.libp2p.direct/tcp/9092/tls/ws/p2p/12D3KooWL9UKRwGWE6GGxANhDZpJNyDphQcfBSApuXE1qTW5pkVh'
]);

const ADDRESS_KEY = 'yogasuci:relay-address';

/**
 * The address somebody entered, if they entered one.
 *
 * @returns {string}
 */
export function relayAddress() {
	if (typeof localStorage === 'undefined') return '';

	try {
		return localStorage.getItem(ADDRESS_KEY) ?? '';
	} catch {
		return '';
	}
}

/**
 * @param {string} address a multiaddr, or empty to go back to the baked list
 */
export function setRelayAddress(address) {
	if (typeof localStorage === 'undefined') return;

	try {
		const trimmed = address.trim();
		if (trimmed) localStorage.setItem(ADDRESS_KEY, trimmed);
		else localStorage.removeItem(ADDRESS_KEY);
	} catch {
		// As with the switch: this session behaves as asked, the next one starts
		// from the baked list.
	}
}

/**
 * Which addresses this device should bootstrap from.
 *
 * An entered address *replaces* the baked ones rather than joining them.
 * Somebody who names their own relay has said which machine they trust with
 * the fact that they are connecting; quietly dialling ours as well would take
 * that back.
 *
 * @returns {readonly string[]}
 */
export function relayAddresses() {
	const own = relayAddress();
	return own ? [own] : BAKED_IN;
}

/** For the screen, so it can show what would be used when the field is empty. */
export function bakedRelayAddresses() {
	return BAKED_IN;
}

/**
 * Whether a string is an address this app could actually bootstrap from.
 *
 * Deliberately stricter than "parses as a multiaddr": an address without a peer
 * id is one nobody can be sure they reached, and a relay is precisely the
 * machine you want to be sure about. Rejecting early also means the screen can
 * say so while somebody is still looking at the field, rather than the node
 * failing to start on the next load with nothing to point at.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isUsableRelayAddress(value) {
	const trimmed = value.trim();
	if (!trimmed.startsWith('/')) return false;

	try {
		// Parsed first, so a malformed address is rejected by the library rather
		// than by a guess of ours — then read back as a string and checked for the
		// peer id. Read from the parsed form rather than the input because that one
		// is normalised, and against the string rather than an accessor because
		// this library has already renamed those between versions.
		return /\/p2p\/[A-Za-z0-9]+/.test(multiaddr(trimmed).toString());
	} catch {
		return false;
	}
}
