import { describe, expect, it } from 'vitest';

import { releaseName } from './build-version.mjs';

describe('what the footer calls this build', () => {
	it('names the tag when the build is exactly on one', () => {
		expect(releaseName('v0.2.0-0-gabc1234')).toBe('v0.2.0');
	});

	it('says how far past the last release it is', () => {
		// The honest answer to "what am I running" between releases, and the thing
		// package.json could never say.
		expect(releaseName('v0.2.0-7-gabc1234')).toBe('v0.2.0+7');
	});

	it('does not print the commit twice', () => {
		// The stamp carries the commit in its own field. Seeing it again inside the
		// version is how a reader starts wondering whether they are looking at one
		// build or two.
		expect(releaseName('v0.2.0-7-gabc1234')).not.toContain('abc1234');
	});

	it('keeps a tag that has dashes of its own', () => {
		expect(releaseName('v1.0.0-rc.1-3-gdeadbee')).toBe('v1.0.0-rc.1+3');
	});

	it('says nothing rather than guessing', () => {
		// No tag, no repository, or a shallow clone that left the tags behind. All
		// three are real ways to build this, and in all three the footer drops the
		// version and keeps commit and time — which is accurate, where inventing a
		// number would not be.
		expect(releaseName('')).toBe('');
		expect(releaseName('   ')).toBe('');
	});

	it('refuses output that is not a describe', () => {
		// `git describe` without --long prints a bare tag, and a parser that
		// accepted both shapes would meet the second one for the first time in
		// production. Better to lose the version than to print a wrong one.
		expect(releaseName('v0.2.0')).toBe('');
		expect(releaseName('fatal: no names found')).toBe('');
	});
});
