// The wording for the custom elements from `@le-space/libp2p-webrtc-qr`.
//
// Those elements ship one language and a seam to replace it (upstream #51).
// This file is that replacement, and it exists so the connect screen keeps its
// own rule: every string a person reads goes through Paraglide, whether the
// markup came from us or from a package.
//
// Without it the German handbook showed a panel labelled
// "Browser · IPv4 · IPv6 · Camera · Result" under German headings — correct
// English, in the wrong place.
//
// The entries carrying numbers are functions rather than templates on the
// package side, so the Paraglide message takes the numbers as parameters and
// this file is only the bridge between the two shapes.

import * as m from '$lib/paraglide/messages.js';

/** Rows and verdicts of the readiness panel. */
export function statusStrings() {
	return {
		browser: m.el_browser(),
		ipv4: m.el_ipv4(),
		ipv6: m.el_ipv6(),
		camera: m.el_camera(),
		overall: m.el_overall(),
		open: m.el_open(),
		relay: m.el_relay(),
		symmetric: m.el_symmetric(),
		blocked: m.el_blocked()
	};
}

/** The camera dialog. */
export function scannerStrings() {
	return {
		label: m.el_scan_label(),
		close: m.el_close(),
		unsupported: m.el_unsupported(),
		starting: m.el_starting(),
		looking: m.el_looking(),
		stillLooking: (/** @type {{ attempts: number }} */ { attempts }) =>
			m.el_still_looking({ attempts: String(attempts) }),
		rejected: m.el_rejected(),
		animated: (/** @type {{ received: number, total: number }} */ { received, total }) =>
			m.el_animated({ received: String(received), total: String(total) }),
		animatedUnknown: m.el_animated_unknown()
	};
}

/** The invitation code, including the caption of an animated sequence. */
export function inviteStrings() {
	return {
		alt: m.el_invite_alt(),
		part: (/** @type {{ slot: number, total: number }} */ { slot, total }) =>
			m.el_invite_part({ slot: String(slot), total: String(total) }),
		recovery: m.el_invite_recovery()
	};
}
