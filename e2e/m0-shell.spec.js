// Scaffold gate (T0.1/T0.2): the shell, the theme and the language switch.
// Every later milestone adds its own m*-spec; this one keeps the foundation
// from rotting.

import { test, expect, connectViaPaste, onboard } from './fixtures.js';

test.describe('app shell', () => {
	test('the front page names both ways in, and the handbook', async ({ alice }) => {
		await alice.goto('/');

		// Somebody arriving here has two questions — what is this, and where do I
		// start — and neither is answered by a list of milestones, which is what this
		// page used to show on a live domain.
		await expect(alice.getByTestId('start-intro')).toBeVisible();
		await expect(alice.getByTestId('start-studio')).toBeVisible();
		await expect(alice.getByTestId('start-student')).toBeVisible();

		// There is nobody to ring when something is unclear, so the way to the
		// handbook belongs on the page before anyone needs it.
		await expect(alice.getByTestId('start-handbook')).toHaveAttribute('href', /handbuch/);
	});

	test('nothing scrolls sideways on a phone, with or without the counter screens', async ({
		alice,
		bob
	}) => {
		test.setTimeout(600_000);

		// The measurement that found this, kept as the guard. The header used to make
		// the document 941 px wide on a 375 px phone — the whole page scrolled
		// sideways, on every screen, and it was still overflowing at 768 px. A flex
		// item does not shrink below its content, so eight navigation entries simply
		// pushed the page apart.
		//
		// Checked for both kinds of device, because a counter has four entries more
		// and gains them the moment it is approved — the width changes under the app,
		// not just between installations.
		await setUpStudioLightly(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', {
			timeout: 90_000
		});

		for (const page of [alice, bob]) {
			for (const width of [375, 768, 1024]) {
				await page.setViewportSize({ width, height: 812 });
				const size = await page.evaluate(() => ({
					scroll: document.documentElement.scrollWidth,
					client: document.documentElement.clientWidth
				}));
				expect(size.scroll, `${width}px viewport`).toBeLessThanOrEqual(size.client);
			}
		}
	});

	test('the app is installable, and the pieces that make it so are served', async ({ alice }) => {
		// Installability breaks silently: a manifest that 404s or an icon that moved
		// costs nothing at build time and quietly turns the app back into a web page.
		// So the files are fetched rather than assumed.
		await alice.goto('/?ice=host');

		const manifestHref = await alice.getAttribute('link[rel="manifest"]', 'href');
		expect(manifestHref).toBeTruthy();

		const manifest = await alice.evaluate(async (href) => {
			const response = await fetch(/** @type {string} */ (href));
			return response.ok ? await response.json() : null;
		}, manifestHref);

		expect(manifest).not.toBeNull();
		expect(manifest.display).toBe('standalone');
		// Landscape matters here: an iPad at a front desk does not stand upright.
		expect(manifest.orientation).toBe('any');

		// A maskable icon is what stops Android drawing the logo in a white circle.
		const purposes = manifest.icons.map((/** @type {any} */ icon) => icon.purpose ?? '');
		expect(purposes).toContain('maskable');

		// Every icon actually reachable, not merely listed.
		for (const icon of manifest.icons) {
			const ok = await alice.evaluate(
				async (src) => (await fetch(src, { method: 'HEAD' })).ok,
				new URL(icon.src, new URL(manifestHref ?? '/', alice.url())).pathname
			);
			expect(ok, `icon ${icon.src}`).toBe(true);
		}
	});

	test('the imprint and privacy statement are reachable without an identity', async ({ alice }) => {
		// Before any passkey exists, and without ever creating one. A legal notice
		// behind an identity gate is not a legal notice — and it has to be on every
		// page, which is why the link is in the footer rather than the front page.
		await alice.goto('/program/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });
		await alice.getByTestId('nav-legal').click();

		await expect(alice.getByTestId('legal-imprint')).toBeVisible();
		await expect(alice.getByTestId('legal-privacy')).toBeVisible();

		// The two claims this page exists to make, and the one it must not overstate.
		const text = await alice.getByTestId('legal-privacy').textContent();
		expect(text).toMatch(/IPFS/);
		expect(text).toMatch(/STUN/);

		// The operator has to be findable, not only named. One link in each of the
		// two documents — asserted as a real href, because a URL rendered as text
		// in a legal notice is the kind of thing that looks right and is not.
		const links = alice.getByTestId('legal-link');
		await expect(links).toHaveCount(2);
		await expect(links.first()).toHaveAttribute('href', 'https://le-space.de');
	});

	test('says which build it is, before anyone has an identity', async ({ alice }) => {
		// There is no server to ask which version a studio runs, and no way to push
		// one: a device runs whatever it last installed, and a PWA can sit on a
		// cached build for weeks. When something does not arrive, the first useful
		// question is which build each device is on.
		//
		// Alongside the legal link and for the same reason — on every page, and
		// reachable by somebody who never creates a passkey. A person reporting a
		// problem should not have to get past onboarding to read it.
		await alice.goto('/program/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });

		// Asserted as three real parts, because the way this fails is quietly: an
		// undefined replacement renders the literal word, and "vundefined" in a
		// footer looks enough like a version to be scrolled past.
		await expect(alice.getByTestId('build-stamp')).toHaveText(
			/^v\d+\.\d+\.\d+ · [0-9a-f]{7,40} · .+\d.+$/
		);
	});

	// Language follows the device before anything else, so the locale is set on
	// the context rather than assumed. Both directions are checked: a German
	// browser must not land in English, and an English one must not land in
	// German just because the studio is German.
	//
	// Probed on a navigation label rather than on the app's name. The name used to
	// serve as the probe and stopped working the moment it became a proper noun —
	// Yogasūcī is the same word in both languages, so asserting on it proved
	// nothing at all. A label that genuinely differs is what this test always meant.
	for (const { locale, expected } of [
		{ locale: 'de-DE', expected: 'Programm' },
		{ locale: 'en-GB', expected: 'Programme' }
	]) {
		test(`follows the browser language ${locale}`, async ({ browser }) => {
			const context = await browser.newContext({ locale });
			const page = await context.newPage();
			await page.goto('/');

			await expect(page.getByTestId('nav-program')).toHaveText(expected);
			await context.close();
		});
	}

	test('switches the whole shell to English and keeps it after a reload', async ({ browser }) => {
		const context = await browser.newContext({ locale: 'de-DE' });
		const page = await context.newPage();

		await page.goto('/');
		await expect(page.getByTestId('nav-program')).toHaveText('Programm');

		await page.getByTestId('language-en').click();
		await expect(page.getByTestId('nav-program')).toHaveText('Programme');

		// An explicit choice must outrank the browser preference, not be reset by it.
		await page.reload();
		await expect(page.getByTestId('nav-program')).toHaveText('Programme');

		// And the name is a name: the same in both, which is why it is no longer the
		// thing this test asks about.
		await expect(page.getByTestId('app-name')).toContainText('Yogasūcī');

		await context.close();
	});
});

test.describe('theme', () => {
	test('follows the system preference on first visit', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await page.goto('/');

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await context.close();
	});

	test('toggles and persists the choice', async ({ alice }) => {
		await alice.goto('/');
		const html = alice.locator('html');
		const before = await html.getAttribute('data-theme');

		await alice.getByTestId('theme-toggle').click();
		const after = await html.getAttribute('data-theme');
		expect(after).not.toBe(before);

		await alice.reload();
		await expect(html).toHaveAttribute('data-theme', /** @type {string} */ (after));
	});

	test('never paints the wrong theme first', async ({ browser }) => {
		// The inline script in app.html must set the attribute before the first
		// stylesheet applies. Reading it on DOMContentLoaded — before hydration —
		// is what proves there is no flash: if the attribute were set by the
		// component, it would still be missing at this point.
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();

		await page.goto('/', { waitUntil: 'commit' });
		const themeAtParse = await page.evaluate(() => {
			return new Promise((resolve) => {
				if (document.readyState !== 'loading') {
					resolve(document.documentElement.dataset.theme);
					return;
				}
				document.addEventListener('DOMContentLoaded', () =>
					resolve(document.documentElement.dataset.theme)
				);
			});
		});

		expect(themeAtParse).toBe('dark');
		await context.close();
	});
});

test.describe('ticket balance', () => {
	test('says plainly that nothing has been bought yet', async ({ bob }) => {
		test.setTimeout(180_000);

		// This screen used to render sample data. It now folds the device's real
		// ledger, so a device that has bought nothing shows nothing — and says so,
		// rather than a zero that could be mistaken for a used-up pass.
		await bob.goto('/tickets/?ice=host');
		await onboard(bob, 'bob');

		await expect(bob.getByTestId('tickets-empty')).toBeVisible();
		await expect(bob.getByTestId('ticket-card')).toHaveCount(0);
	});

	// The balance card's other states — units counting down, "Stand vom …", and
	// the fork alarm with both signed events as proof — are covered where they
	// can be produced for real: m4-tickets.spec.js for a bought pass, and the
	// fork alarm with T4.4. Rendering them from fixtures proved the component,
	// not the app.
});

/**
 * Just enough of a studio that the counter entries appear.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setUpStudioLightly(page) {
	await page.goto('/studio/?ice=host');
	await onboard(page, 'alice');
	await page.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await page.getByTestId('studio-save').click();
	await page.getByTestId('location-id').fill('altstadt');
	await page.getByTestId('location-name-de').fill('Studio Altstadt');
	await page.getByTestId('location-name-en').fill('Old Town Studio');
	await page.getByTestId('location-add').click();
	await expect(page.locator('[data-location-id="location:altstadt"]')).toBeVisible();
}
