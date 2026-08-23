import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { execSync } from 'child_process';

import { currentRelease } from './scripts/build-version.mjs';

const buildDate = new Date().toISOString();

/**
 * The commit this build came from.
 *
 * Environment first: CI checks out a detached HEAD, and GitHub hands the SHA
 * over in `GITHUB_SHA` — asking git there works but describes the checkout
 * rather than the thing that triggered it. Falls back to git for a local build,
 * and to nothing at all for a build from a tarball with no repository, which is
 * a real way to build this and not a reason to fail.
 *
 * Empty rather than 'unknown': the footer omits a line it has nothing for, and
 * printing the word "unknown" to a studio would be worse than printing nothing.
 */
function currentCommit() {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);

	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

const commit = currentCommit();

// From the last tag, not from package.json — see scripts/build-version.mjs for
// why that field stopped being the answer. Empty until a tag exists, and the
// footer then shows commit and time only.
const release = currentRelease();

export default defineConfig({
	test: {
		// The ledger is pure and must stay runnable without a browser
		// (CLAUDE.md) — node is the environment that proves it.
		environment: 'node',
		// `scripts/` too: what the footer calls a build is decided at build time,
		// so the module that decides it lives outside src/ — and is exactly the
		// kind of parser that should not meet its second input shape in production.
		include: ['src/**/*.spec.{js,ts}', 'scripts/**/*.spec.{js,ts}']
	},
	plugins: [
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		}),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			manifest: false, // static/manifest.webmanifest is the source of truth
			// The plugin's own copy of the setting, under `kit` — it does not read
			// `src/routes/+layout.js`, and it is the last argument its manifest
			// transform receives. Without it the precache stored `program` while
			// every link in the app points at `/program/`, so the document sat in
			// the cache under a name nothing ever requested and an offline reload on
			// a subpage failed outright. #72.
			//
			// This is also why writing our own `manifestTransforms` was the wrong
			// lever: the plugin guards with `if (!config.manifestTransforms)`, so
			// supplying one *replaces* its own rewrite rather than adding to it —
			// which is how that attempt produced raw `prerendered/pages/…` paths.
			kit: { trailingSlash: 'always' },
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
				// Helia/libp2p bundles are large; the default 2 MiB cap would drop them.
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
				// No navigation fallback. The default answers *every* navigation with
				// the precached "/" document, which is right for a single-page app and
				// wrong here: adapter-static prerenders a document per route, and all
				// ten are in the precache. With the fallback in place, reloading on
				// /program served the front page — a front desk would have been thrown
				// back to the start screen by a refresh, and ten tests that reload said
				// so the moment the worker was finally registered.
				navigateFallback: null,
				// Match a precached document regardless of query string. Workbox
				// compares the whole URL by default, so `/program/?ice=host` misses the
				// entry stored as `program` — and that is every link this project hands
				// out for a test or a benchmark run.
				//
				// Removing the fallback exposed it: the fallback had been papering over
				// this second problem while causing the first, which is why taking it
				// out fixed ten tests and broke the offline one. Ignoring parameters is
				// the narrow fix, and it is sound here because there is no server: a
				// query string is read by the page after it loads, never by something
				// that decides which document to send.
				ignoreURLParametersMatching: [/.*/]
			}
		}),
		nodePolyfills(
			/** @type {any} */ ({
				include: ['buffer', 'crypto', 'events', 'process', 'stream', 'util'],
				globals: { Buffer: true, global: true, process: true },
				protocolImports: true
			})
		)
	],
	/**
	 * Keep the WebRTC transport out of the server bundle.
	 *
	 * The server bundle exists only so SvelteKit can prerender these pages, and
	 * every route here is `ssr = false` — nothing in it ever runs this code, while
	 * `@libp2p/webrtc` reaches `node-datachannel`, a native addon with per-platform
	 * prebuilds that has no business being bundled for a prerender.
	 *
	 * Added while chasing a different failure and kept on its own merits. It was
	 * *not* the cause of that one: the real error was that `@libp2p/webrtc` was
	 * never declared in package.json — it happened to sit in node_modules here as
	 * somebody else's transitive dependency, which pnpm does not make importable
	 * and CI therefore did not have. What the build reported instead was
	 * vite-plugin-pwa finding an empty precache, because rollup was already
	 * tearing down and that hook spoke last (#94).
	 */
	ssr: {
		external: ['@libp2p/webrtc', 'node-datachannel']
	},
	define: {
		__APP_VERSION__: JSON.stringify(release),
		__BUILD_DATE__: JSON.stringify(buildDate),
		__COMMIT__: JSON.stringify(commit)
	}
});
