// One place that knows a write is happening, and says so.
//
// Every screen that changes something funnels its actions through a wrapper
// that used to exist twice, copied between the studio and the programme, and
// did nothing but swallow the error. So a save was a second of awaited signing
// with no sign of it anywhere: the form fields keep showing what was typed
// either way, because they are bound to the form rather than to what was
// stored. The app looked finished while it was not, and leaving then — a
// reload, a locked phone, a closed tab — lost the write with nothing having
// warned that it might (#86).
//
// Two things follow from having it in one place. Each screen reports its own
// forms without repeating the logic, and the app as a whole knows whether any
// write is in flight — which is what makes the guard below possible at all.

import { writable } from 'svelte/store';

/**
 * How many writes are running anywhere in the app.
 *
 * A count rather than a flag, because two forms can be saving at once and a
 * flag would be cleared by whichever finished first.
 */
export const pendingWritesStore = writable(0);

/**
 * The write state for one screen.
 *
 * Per screen rather than global, because "saving" belongs to the form somebody
 * pressed and two forms on one page must not report each other's progress.
 *
 * @returns {{ readonly error: string, run: (action: () => Promise<void>, what?: string) => Promise<void>, stateOf: (what: string) => 'saving' | 'saved' | 'idle', clearError: () => void }}
 */
export function createWrites() {
	let busy = $state('');
	let settled = $state('');
	let error = $state('');

	return {
		get error() {
			return error;
		},

		clearError() {
			error = '';
		},

		/**
		 * @param {() => Promise<void>} action
		 * @param {string} [what] names the form this belongs to
		 */
		async run(action, what = '') {
			error = '';
			busy = what;
			settled = '';
			pendingWritesStore.update((n) => n + 1);

			try {
				await action();
				// Only now, and only because these actions end by reading the database
				// back — this says "it is stored", not "the click was handled".
				settled = what;
			} catch (/** @type {any} */ cause) {
				error = cause?.message ?? String(cause);
			} finally {
				busy = '';
				pendingWritesStore.update((n) => Math.max(0, n - 1));
			}
		},

		/** @param {string} what */
		stateOf(what) {
			if (busy === what) return 'saving';
			if (settled === what) return 'saved';
			return 'idle';
		}
	};
}
