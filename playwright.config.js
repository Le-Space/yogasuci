import { defineConfig, devices } from '@playwright/test';

const PORT = 4183;

export default defineConfig({
	testDir: 'e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	// A failing handshake is almost always a real failure, not a flake. One
	// retry in CI covers runner hiccups without hiding a broken transport.
	retries: process.env.CI ? 1 : 0,
	// 4183, not vite's default 4173. Several projects on this machine preview on
	// the default, all of them with `--strictPort`, so whichever suite started
	// second died with "port already used" — and the first one to notice was a
	// developer wondering why an unrelated repository's tests had stopped working.
	// A port of our own costs nothing and removes the class of failure; sharing it
	// makes every local run depend on what else happens to be running.
	//
	// One constant rather than three literals: the command, the readiness probe
	// and the baseURL have to agree, and the way that breaks is a suite that waits
	// four minutes for a server already listening somewhere else.
	webServer: {
		command: `pnpm run build && pnpm exec vite preview --port ${PORT} --strictPort`,
		port: PORT,
		// Never reuse, not even locally. A server left running from an earlier run
		// serves the bundle it was built from, so a local run can silently test
		// code that no longer exists — which cost several debugging rounds where
		// a fix appeared not to work because it was never in the bundle.
		// Rebuilding costs ~20s; being wrong about what is under test costs more.
		reuseExistingServer: false,
		timeout: 240_000
	},
	use: {
		baseURL: `http://localhost:${PORT}`,
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		trace: 'on-first-retry'
	},
	projects: [
		{
			// Chromium is the gate: the QR transport is not upstream-tested on
			// Firefox or WebKit yet (docs/LIMITS.md). Those run nightly, non-blocking.
			name: 'chromium',
			// The screenshot run is not a test — it asserts almost nothing and writes
			// files into the handbook. Excluded here so the gate stays a gate, and run
			// on its own through `pnpm run screenshots`. The remote scenario is
			// excluded for a different reason: it brings its own browsers.
			testIgnore: [/screenshots\.spec\.js/, /remote\//],
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					args: [
						// Camera path in CI: a fake device, so the real decoder runs
						// against a real MediaStream instead of a mocked one.
						'--use-fake-ui-for-media-stream',
						'--use-fake-device-for-media-stream',
						// Headless Chromium treats a page nothing is looking at as
						// backgrounded and throttles its timers and animation frames.
						// The offering device spends the handshake waiting on exactly
						// those, so it would sit at 'replying' while the answer was
						// already there - which is why the camera test passed with
						// --headed and failed without it.
						'--disable-background-timer-throttling',
						'--disable-backgrounding-occluded-windows',
						'--disable-renderer-backgrounding'
					]
				}
			}
		},
		// Only present when asked for, and that took a failing run to get right:
		// `testIgnore` above keeps the file out of the *chromium* project, but
		// `playwright test` with no `--project` runs every project there is — so the
		// generator joined the gate, competed with it for machines and timed out after
		// fifteen minutes. Existing conditionally is the only version of "excluded"
		// that actually excludes.
		// Same reasoning as the screenshots project below: conditional existence is
		// the only exclusion that actually excludes, since `playwright test` with
		// no --project runs every project there is. This one would otherwise start
		// its own browsers alongside the gate and compete with it for machines.
		...(process.env.REMOTE_SCENARIO
			? [
					{
						// Deliberately no `use.launchOptions`: this project never launches a
						// browser. Both devices are connected to, so anything set here would
						// be quietly ignored — see e2e/remote/providers.mjs.
						name: 'remote',
						testMatch: /remote-scenario\.spec\.js/,
						use: { ...devices['Desktop Chrome'] }
					}
				]
			: []),
		...(process.env.SCREENSHOT_LOCALE
			? [
					{
						// Same browser, same fixtures, different purpose: drive the app through
						// the states the handbook describes and photograph them. A fixed
						// viewport so the pictures line up with each other rather than with
						// whoever ran them.
						name: 'screenshots',
						testMatch: /screenshots\.spec\.js/,
						use: {
							...devices['Desktop Chrome'],
							viewport: { width: 1100, height: 800 },
							launchOptions: {
								args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
							}
						}
					}
				]
			: [])
	]
});
