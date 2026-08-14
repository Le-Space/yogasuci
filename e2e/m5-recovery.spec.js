// T5.2 — what survives losing a device, and what does not.
//
// Three separate failures, and the app owes a different answer to each:
//
//   - the browser profile is gone, the passkey is not  → same DID, same ledger
//   - the passkey is gone too                          → new DID, balance moved
//   - the studio runs on one device                    → say so, loudly, until fixed
//
// The export underpins all three: with no server it is the only copy that outlives
// every device at once, which is why it carries signed events rather than balances.

import {
	connectViaPaste,
	expect,
	onboard,
	openCourseForm,
	openPackageForm,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('backup and recovery', () => {
	test('a studio on one device says so until a second one exists', async ({ alice, carol }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);
		await alice.getByTestId('nav-studio').click();

		// Demanded rather than suggested: lose this device and nobody can approve or
		// revoke anything again, and every ledger address in the studio derives from
		// the owner DID it held.
		await expect(alice.getByTestId('second-device-warning')).toBeVisible(READY);
		await expect(alice.getByTestId('second-device-action')).toBeVisible();

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const carolDid = await carol.evaluate(() => window.__yoga.identity());
		await approveDevice(alice, carolDid, 'location:altstadt');

		// And it goes away on its own, because it was derived from the registry rather
		// than dismissed by a click.
		await alice.getByTestId('nav-studio').click();
		await expect(alice.getByTestId('second-device-warning')).toHaveCount(0);
	});

	test('the export carries signed events, not balances', async ({ alice, bob }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid);

		await alice.getByTestId('nav-studio').click();
		const download = alice.waitForEvent('download');
		await alice.getByTestId('export-studio').click();
		const file = await download;

		const bundle = JSON.parse(await readDownload(file));

		expect(bundle.format).toBe('yoga-p2p/export/1');
		expect(bundle.studio.name).toBe('Yoga Eggenfelden');
		expect(bundle.devices.length).toBeGreaterThan(0);

		// The signed issue event itself, so an auditor — or this studio in two years,
		// without this app — can re-verify it against the registry.
		const events = bundle.ledgers[bobDid];
		const issue = events.find((/** @type {any} */ event) => event.type === 'issue');
		expect(issue.sig).toBeTruthy();
		expect(issue.unitsTotal).toBe(10);
		expect(issue.issuedBy.deviceDid).toBeTruthy();

		// And the count on screen is checkable against the file.
		await expect(alice.getByTestId('export-done')).toContainText(String(events.length));
	});

	test('a wiped browser profile comes back as the same DID, and the passes with it', async ({
		alice,
		bob
	}) => {
		test.setTimeout(900_000);

		/** @type {string[]} */
		const bobLog = [];
		bob.on('console', (msg) => {
			if (/largeBlob|passkey|blob/i.test(msg.text()))
				bobLog.push(`${msg.type()}: ${msg.text().slice(0, 240)}`);
		});

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, bobDid);
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);

		// A reinstalled app: every trace of the studio gone — remembered database
		// addresses, theme, locale — with only the passkey record left, which is what
		// a password manager or platform keychain hands back on a new install.
		//
		// The largeBlob path that would make even *that* unnecessary is deliberately
		// not asserted here, and the reason is measured rather than assumed: under
		// Chromium's CDP virtual authenticator a write reports success and the
		// subsequent read returns no blob, and `WebAuthn.getCredentials` does not
		// expose a `largeBlob` field at all — so it can be neither round-tripped nor
		// carried to a second authenticator. docs/LIMITS.md §2.5 records both
		// measurements; the app now says so out loud instead of falling back in
		// silence.
		// First with *everything* gone, which is the case that was unreachable before:
		// the offer to recover used to be hidden unless local storage already
		// remembered a credential — never true on the device somebody picks up after
		// losing the last one. Registering instead would mint a new DID and lose the
		// passes for good.
		const passkey = await bob.evaluate(() => {
			const stored = localStorage.getItem('yoga-p2p.passkeyCredential');
			localStorage.clear();
			return stored;
		});
		expect(passkey).toBeTruthy();

		await bob.reload();
		await expect(bob.getByTestId('recover-identity')).toBeVisible(READY);

		// Then with the passkey record back, as a keychain or password manager would
		// hand it over on a new install. Everything else stays gone.
		await bob.evaluate((stored) => {
			localStorage.setItem('yoga-p2p.passkeyCredential', /** @type {string} */ (stored));
		}, passkey);
		await bob.reload();

		await expect(bob.getByTestId('studio-ready')).toHaveAttribute('data-did', bobDid, READY);

		// And the passes come back on pairing alone — the point of the test. Nothing
		// was restored from a file and no address was remembered: the ledger address
		// follows from the studio owner's DID and Bob's own, so a device that kept
		// nothing but its identity still finds its books (src/lib/db/studio-acl.js).
		await connectViaPaste(alice, bob);
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);
	});

	test('a lost passkey moves the balance to a new DID', async ({ alice, bob, carol }) => {
		test.setTimeout(900_000);

		// Carol stands in for Bob's replacement phone here: a second student device,
		// paired with the same counter, holding a different DID. That is exactly the
		// situation after a passkey is gone for good.
		await setUpStudio(alice);

		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		const oldDid = await bob.evaluate(() => window.__yoga.identity());
		await sellPass(alice, oldDid);

		await alice.getByTestId('nav-checkin').click();
		await alice.getByTestId('checkin-student').selectOption(oldDid);
		await alice.getByTestId('checkin-course').selectOption('course:vinyasa-mi-18');
		await expect(alice.getByTestId('checkin-redeem').first()).toBeEnabled(REPLICATED);
		await alice.getByTestId('checkin-redeem').first().click();
		await expect(alice.getByTestId('checkin-done')).toBeVisible();

		await connectViaPaste(alice, carol);
		const newDid = await carol.evaluate(() => window.__yoga.identity());

		await alice.getByTestId('nav-till').click();
		await expect(alice.getByTestId('transfer-from')).toBeVisible(REPLICATED);
		await alice.getByTestId('transfer-from').selectOption(oldDid);
		await alice.getByTestId('transfer-to').selectOption(newDid);
		await alice.getByTestId('transfer-submit').click();

		await expect(alice.getByTestId('transfer-done')).toContainText('1');
		await expect(alice.getByTestId('transfer-void-failed')).toHaveCount(0);

		// Nine, not ten: the transfer moves what is left, and does not quietly hand
		// back the class that was already attended.
		await carol.getByTestId('nav-tickets').click();
		await expect(carol.getByTestId('ticket-balance')).toHaveText('9', REPLICATED);

		// The old card is voided rather than deleted — the history of a paid pass has
		// to stay readable, and a voided ticket cannot be redeemed again.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('ticket-card').first()).toHaveAttribute(
			'data-status',
			'voided',
			REPLICATED
		);
	});
});

/** @param {import('@playwright/test').Download} download */
async function readDownload(download) {
	const stream = await download.createReadStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} did
 * @param {string} locationId
 */
async function approveDevice(page, did, locationId) {
	await page.getByTestId('nav-studio').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);

	const pending = page.locator(`[data-testid="pending-device"][data-device-did="${did}"]`);
	await expect(pending).toBeVisible(READY);
	await pending.getByTestId('pending-device-role').selectOption('front-desk');
	await pending.getByTestId('pending-device-location').selectOption(locationId);
	await pending.getByTestId('pending-device-register').click();

	await expect(page.locator(`[data-testid="device-item"][data-device-did="${did}"]`)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} studentDid
 */
async function sellPass(page, studentDid) {
	await page.getByTestId('nav-till').click();
	await expect(page.getByTestId('till-student')).toBeVisible(REPLICATED);
	await page.getByTestId('till-student').selectOption(studentDid);
	await page.getByTestId('till-package').selectOption('package:zehner');
	await page.getByTestId('till-sell').click();
	await expect(page.getByTestId('till-sold')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function setUpStudio(page) {
	await page.goto('/studio/?ice=host');
	await onboard(page, 'alice');

	await page.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await page.getByTestId('studio-save').click();

	await page.getByTestId('location-id').fill('altstadt');
	await page.getByTestId('location-name-de').fill('Studio Altstadt');
	await page.getByTestId('location-name-en').fill('Old Town Studio');
	await page.getByTestId('location-add').click();
	await expect(page.locator('[data-location-id="location:altstadt"]')).toBeVisible();

	await page.getByTestId('nav-program').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);

	await openPackageForm(page);

	await page.getByTestId('package-id').fill('zehner');
	await page.getByTestId('package-name-de').fill('10er-Karte');
	await page.getByTestId('package-name-en').fill('10-class pass');
	await page.getByTestId('package-kind').selectOption('ten');
	await page.getByTestId('package-units').fill('10');
	await page.getByTestId('package-validity-days').fill('30');
	await page.getByTestId('package-add').click();
	await expect(page.locator('[data-package-id="package:zehner"]')).toBeVisible();

	await openCourseForm(page);

	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill('vinyasa-mi-18');
	await page.getByTestId('course-location').selectOption('location:altstadt');
	await page.getByTestId('course-title-de').fill('Vinyasa Flow');
	await page.getByTestId('course-title-en').fill('Vinyasa Flow');
	await page.getByTestId('course-add').click();
	await expect(page.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible();
}
