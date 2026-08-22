import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';

import { createWrites, pendingWritesStore } from './writes.svelte.js';

/** A promise this test decides when to settle. */
function deferred() {
	/** @type {(value?: any) => void} */
	let resolve = () => {};
	/** @type {(reason?: any) => void} */
	let reject = () => {};
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('reporting a write', () => {
	it('is saving while it runs and saved when it is stored', async () => {
		const writes = createWrites();
		const gate = deferred();

		const running = writes.run(() => gate.promise, 'studio');
		expect(writes.stateOf('studio')).toBe('saving');

		gate.resolve();
		await running;

		expect(writes.stateOf('studio')).toBe('saved');
	});

	it('says nothing about a form nobody pressed', async () => {
		// Two forms on one page, and the second must not wear the first one's
		// progress — which is the whole reason a write is named at all.
		const writes = createWrites();

		await writes.run(async () => {}, 'studio');

		expect(writes.stateOf('studio')).toBe('saved');
		expect(writes.stateOf('location')).toBe('idle');
	});

	it('reports a failure instead of claiming it was saved', async () => {
		const writes = createWrites();

		await writes.run(async () => {
			throw new Error('the registry is not open');
		}, 'studio');

		expect(writes.stateOf('studio')).toBe('idle');
		expect(writes.error).toBe('the registry is not open');
	});
});

describe('the count the unload guard reads', () => {
	it('rises while a write runs and falls when it ends', async () => {
		const writes = createWrites();
		const gate = deferred();

		expect(get(pendingWritesStore)).toBe(0);

		const running = writes.run(() => gate.promise, 'studio');
		expect(get(pendingWritesStore)).toBe(1);

		gate.resolve();
		await running;

		expect(get(pendingWritesStore)).toBe(0);
	});

	it('falls back to zero even when the write throws', async () => {
		// Otherwise one failed save would leave the browser asking to confirm every
		// navigation for the rest of the session.
		const writes = createWrites();

		await writes.run(async () => {
			throw new Error('nope');
		}, 'studio');

		expect(get(pendingWritesStore)).toBe(0);
	});

	it('counts two writes at once, not one', async () => {
		// A flag would be cleared by whichever finished first, and the guard would
		// let go while the other was still going.
		const first = createWrites();
		const second = createWrites();
		const a = deferred();
		const b = deferred();

		const one = first.run(() => a.promise, 'studio');
		const two = second.run(() => b.promise, 'course');
		expect(get(pendingWritesStore)).toBe(2);

		a.resolve();
		await one;
		expect(get(pendingWritesStore)).toBe(1);

		b.resolve();
		await two;
		expect(get(pendingWritesStore)).toBe(0);
	});
});
