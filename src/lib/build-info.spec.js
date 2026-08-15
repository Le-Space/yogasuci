// The globals are replaced by vite at build time, so vitest sees the same
// `define` block the app does — these values are the real ones for this run, not
// stubs. That is why the tests below assert shape rather than content: pinning
// the commit would pin the test to whichever commit last ran it.

import { describe, expect, it } from 'vitest';

import { buildStamp, builtAt, commit, version } from './build-info.js';

describe('the build stamp', () => {
	it('carries the commit, which is the field that always answers', () => {
		// The version comes from a tag and is absent between releases — and absent
		// entirely until the first one. The commit is what a fix is traced to, and
		// what identifies a build on a device nobody can reach.
		expect(buildStamp()).toContain(commit);
		expect(commit).toMatch(/^[0-9a-f]{7,40}$/);
	});

	it('shows a release only when there is one, and never doubles its v', () => {
		// `version` is a tag name, so it brings its own `v`. Composing it as
		// `v${version}` — which this did while the number came from package.json —
		// would print `vv0.2.0` on the first tagged build and on no build before it.
		// Deliberately conditional: this repository has no tag yet, and a test that
		// demanded one would fail for a reason that is not a fault.
		if (version) {
			expect(version).toMatch(/^v.+/);
			expect(buildStamp()).toContain(version);
			expect(buildStamp()).not.toContain(`v${version}`);
		} else {
			expect(buildStamp().startsWith(commit)).toBe(true);
		}
	});

	it('shows the time in the reader’s own zone, not as stored', () => {
		// Read by somebody comparing a device against what they did to it this
		// morning. A Z-suffixed timestamp makes them do the arithmetic.
		expect(buildStamp()).not.toContain(builtAt);
		expect(buildStamp({ locale: 'de' })).not.toBe(buildStamp({ locale: 'en-US' }));
	});
});
