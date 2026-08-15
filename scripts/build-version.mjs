// What "version" means for a build, and where the number comes from.
//
// Not `package.json`. That field sat at 0.1.0 from the scaffolding commit until
// this file existed, so every build ever deployed claimed the same version while
// the app underneath changed completely — a standing number that reads as
// progress is worse than no number at all.
//
// Not an automatic bump on every merge either. The commit hash already
// identifies a build uniquely and already moves on every deploy; a counter that
// ticks once per merge is a slower hash with extra ceremony. A version earns its
// place only when something is written against it — release notes, a "what
// changed" a studio can read, and the message that tells a device it is too old
// to pair (#40).
//
// So the number comes from a tag, and a tag is cut when there is something to
// tell a studio. Between releases the build says how far past the last one it
// is, which is the honest answer to "what am I running".

import { execSync } from 'node:child_process';

/**
 * Turn `git describe --long` output into what the footer shows.
 *
 * `--long` is what makes this uniform: without it an exact tag prints bare and
 * anything else prints with a suffix, so the parser would have two shapes to
 * handle and would meet the second one for the first time in production.
 *
 * The `-g<hash>` tail is dropped rather than shown. The stamp already carries
 * the commit as its own field, and printing it twice in one line is the kind of
 * thing that makes a reader doubt they are reading the same build.
 *
 * @param {string} described e.g. `v0.2.0-7-gabc1234`, or '' when there is no tag
 * @returns {string} `v0.2.0`, `v0.2.0+7`, or '' — never a guess
 */
export function releaseName(described) {
	const match = /^(.+)-(\d+)-g[0-9a-f]+$/.exec(described.trim());

	if (!match) return '';

	const [, tag, distance] = match;

	// Exactly on the tag: no `+0`, which would read as a build number and is
	// noise on the one build where the version is exact.
	return Number(distance) === 0 ? tag : `${tag}+${distance}`;
}

/**
 * Ask git where this build sits relative to the last release.
 *
 * Returns '' rather than throwing when there is no tag, no repository, or a
 * shallow clone with the tags left behind — all three are real ways to build
 * this, and none is a reason to fail a build. What they do mean is that the
 * footer shows commit and time without a version, which is accurate.
 *
 * **CI has to fetch tags for this.** `actions/checkout` clones shallow by
 * default and brings none, so without `fetch-depth: 0` this silently returns ''
 * and the deployed app quietly loses its version — correct-looking output from a
 * broken input, which is why the workflows say so at the checkout step.
 *
 * @returns {string}
 */
export function currentRelease() {
	try {
		const described = execSync('git describe --tags --long --match "v*"', {
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString();

		return releaseName(described);
	} catch {
		return '';
	}
}
