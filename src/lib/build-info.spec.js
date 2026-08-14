// The globals are replaced by vite at build time, so vitest sees the same
// `define` block the app does — these values are the real ones for this run, not
// stubs. That is why the tests below assert shape rather than content: pinning
// the commit would pin the test to whichever commit last ran it.

import { describe, expect, it } from 'vitest';

import { buildStamp, builtAt, commit, version } from './build-info.js';

describe('the build stamp', () => {
	it('carries the version, so a release note has something to name', () => {
		expect(buildStamp()).toContain(`v${version}`);
	});

	it('carries the commit, because a version says nothing about what happened since', () => {
		// Cut rarely, by hand; the commit is what a fix is actually traced to.
		expect(buildStamp()).toContain(commit);
		expect(commit).toMatch(/^[0-9a-f]{7,40}$/);
	});

	it('shows the time in the reader’s own zone, not as stored', () => {
		// Read by somebody comparing a device against what they did to it this
		// morning. A Z-suffixed timestamp makes them do the arithmetic.
		expect(buildStamp()).not.toContain(builtAt);
		expect(buildStamp({ locale: 'de' })).not.toBe(buildStamp({ locale: 'en-US' }));
	});
});
