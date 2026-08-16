// Keep the screen awake while a code is on it.
//
// A phone lying on the counter with an invitation showing goes dark after
// fifteen or thirty seconds, and the person meant to scan it is still getting
// their own phone out. The same on the other side: a scanner that dims mid-aim
// loses the frame it was about to read. Neither is a connection problem, and
// neither has anything to do with the transport — the screen simply went away.
//
// What this deliberately does *not* claim: it holds the **screen**, not the
// page. A browser releases the lock the moment the page stops being visible, so
// this does nothing for a phone whose owner switches to a messenger — that is a
// different problem with a different answer (libp2p-webrtc-qr AGENTS.md §1, and
// #62 priority 2). It also does not survive somebody deliberately locking their
// phone, and it should not pretend to.
//
// Adapted from the demo in libp2p-webrtc-qr rather than imported: it lives in
// that package's example, not in its API.

/** @type {any} */
let lock = null;
let wanted = false;

/**
 * `wanted` is our decision, `held` is the browser's answer to it.
 *
 * Reported apart because only the first is ours to get right. A headless
 * browser exposes the API and then refuses every request, having no screen to
 * keep awake — so a test asserting on `held` would be asserting on the platform
 * rather than on this app.
 */
export function wakeLockState() {
	return {
		supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
		wanted,
		held: lock != null
	};
}

/**
 * @param {boolean} active whether something on screen needs to stay readable
 */
export async function syncWakeLock(active) {
	wanted = active;

	if (!wanted || document.visibilityState !== 'visible') {
		await release();
		return;
	}

	await acquire();
}

async function acquire() {
	if (!wakeLockState().supported || lock != null) return;

	try {
		const held = await /** @type {any} */ (navigator).wakeLock.request('screen');

		// The request can resolve after the page has gone away again, and keeping
		// it then would leave a lock nobody asked for holding somebody's screen on.
		if (!wanted || document.visibilityState !== 'visible') {
			await held.release().catch(() => {});
			return;
		}

		held.addEventListener('release', () => {
			if (lock === held) lock = null;
		});

		lock = held;
	} catch {
		// Denied, unsupported in this context, or the document turned out not to be
		// visible. None of it is worth interrupting somebody over — the screen just
		// behaves the way it did before.
	}
}

async function release() {
	const held = lock;

	lock = null;

	if (held != null) await held.release().catch(() => {});
}
