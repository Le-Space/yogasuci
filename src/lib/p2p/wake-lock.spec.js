import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncWakeLock, wakeLockState } from './wake-lock.js';

/** A sentinel the browser hands back, which we have to give up again. */
function fakeSentinel() {
	return {
		released: false,
		addEventListener() {},
		async release() {
			this.released = true;
		}
	};
}

/** @type {any} */
let sentinel;

beforeEach(() => {
	sentinel = fakeSentinel();
	vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(async () => sentinel) } });
	vi.stubGlobal('document', { visibilityState: 'visible' });
});

afterEach(async () => {
	await syncWakeLock(false);
	vi.unstubAllGlobals();
});

describe('holding the screen', () => {
	it('asks for the lock when something needs reading', async () => {
		await syncWakeLock(true);

		expect(wakeLockState().wanted).toBe(true);
		expect(wakeLockState().held).toBe(true);
	});

	it('gives it back when nothing does', async () => {
		await syncWakeLock(true);
		await syncWakeLock(false);

		expect(wakeLockState().held).toBe(false);
		expect(sentinel.released).toBe(true);
	});

	it('asks once, not once per change', async () => {
		// The connect screen recomputes this on every render, so a request per pass
		// would be a request per keystroke.
		await syncWakeLock(true);
		await syncWakeLock(true);

		expect(/** @type {any} */ (navigator).wakeLock.request).toHaveBeenCalledTimes(1);
	});
});

describe('a page that is not on screen', () => {
	it('does not ask at all', async () => {
		// The browser would refuse, and asking anyway turns a normal state into a
		// caught exception on every render.
		vi.stubGlobal('document', { visibilityState: 'hidden' });

		await syncWakeLock(true);

		expect(/** @type {any} */ (navigator).wakeLock.request).not.toHaveBeenCalled();
		expect(wakeLockState().wanted).toBe(true);
	});

	it('gives back a lock it already had', async () => {
		await syncWakeLock(true);

		vi.stubGlobal('document', { visibilityState: 'hidden' });
		await syncWakeLock(true);

		expect(sentinel.released).toBe(true);
		// Still wanted — the screen went away, the reason did not. Coming back
		// visible has to re-acquire, which is why the two are tracked apart.
		expect(wakeLockState().wanted).toBe(true);
	});
});

describe('a browser without the API', () => {
	it('records the wish and does nothing else', async () => {
		vi.stubGlobal('navigator', {});

		await syncWakeLock(true);

		expect(wakeLockState().supported).toBe(false);
		expect(wakeLockState().held).toBe(false);
	});
});
