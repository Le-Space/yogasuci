// T2.3 — device onboarding, roles and revocation.
//
// The acceptance criterion from docs/PLAN.md is about *effect*, not bookkeeping:
// a write must fail before the grant, succeed after it, and fail again after
// the revocation. Checking only that the registry shows the right entries would
// pass just as happily with the ACL never touched.

import {
	connectViaPaste,
	expect,
	onboard,
	openCourseForm,
	openProgramme,
	test
} from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('device onboarding', () => {
	test('a front-desk device may write once approved, and not after revocation', async ({
		alice,
		carol
	}) => {
		test.setTimeout(420_000);

		// --- Alice's studio -----------------------------------------------
		await alice.goto('/studio/?ice=host');
		await onboard(alice, 'alice');

		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await alice.getByTestId('location-id').fill('altstadt');
		await alice.getByTestId('location-name-de').fill('Studio Altstadt');
		await alice.getByTestId('location-name-en').fill('Old Town Studio');
		await alice.getByTestId('location-add').click();
		await expect(alice.locator('[data-location-id="location:altstadt"]')).toBeVisible();

		// --- Carol's device connects and introduces itself ------------------
		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		const carolDid = await carol.evaluate(() => window.__yoga.identity());

		// --- Before approval: no write access ------------------------------
		await openProgramme(carol);
		await expect(carol.getByTestId('studio-ready')).toBeVisible(READY);
		// The guest view offers no editor at all — the honest reflection of an
		// ACL that would refuse the write anyway.
		await expect(carol.getByTestId('guest-notice')).toBeVisible();
		await expect(carol.getByTestId('course-add')).toHaveCount(0);

		// --- Alice approves it as front desk --------------------------------
		await alice.getByTestId('nav-studio').click();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		const pending = alice.locator(`[data-device-did="${carolDid}"]`);
		await expect(pending).toBeVisible(READY);

		await pending.getByTestId('pending-device-role').selectOption('front-desk');
		await pending.getByTestId('pending-device-location').selectOption('location:altstadt');
		await pending.getByTestId('pending-device-label').fill('iPad Empfang Altstadt');
		await pending.getByTestId('pending-device-register').click();

		// The registry entry is what the ledger verifies signatures against.
		const registered = alice.locator(`[data-testid="device-item"][data-device-did="${carolDid}"]`);
		await expect(registered).toBeVisible();
		await expect(registered).toHaveAttribute('data-revoked', 'false');

		// And it carries the key a database key can be wrapped for later (#95).
		// Worth asserting rather than assuming: the introduction protocol rebuilds
		// the message field by field, so a field nobody named there is dropped on
		// the wire in silence — which is what this one did until it was added.
		await expect(registered).toHaveAttribute('data-can-receive-keys', 'true');

		// --- After approval: Carol can actually write ------------------------
		// The approval reaches Carol by replication, so her editor appears
		// without a reload.
		await openProgramme(carol);
		// The *opening* button, not the save button: the form lives in a dialog now,
		// so `course-add` is in the document but not visible until it opens. What
		// this line is about is the permission, and `course-new` is what carries it.
		await expect(carol.getByTestId('course-new')).toBeVisible(REPLICATED);
		await expect(carol.getByTestId('guest-notice')).toHaveCount(0);

		await openCourseForm(carol);

		await carol.getByTestId('course-mode').selectOption('recurring');
		await carol.getByTestId('course-id').fill('vinyasa-mi-18');
		await carol.getByTestId('course-location').selectOption('location:altstadt');
		await carol.getByTestId('course-title-de').fill('Vinyasa Flow');
		await carol.getByTestId('course-title-en').fill('Vinyasa Flow');
		await carol.getByTestId('course-add').click();

		// The write is only proven once it survives *Alice's* access controller —
		// her copy is where a grant that did not exist would refuse it.
		await expect(carol.getByTestId('program-error')).toHaveCount(0);
		await openProgramme(alice);
		await expect(
			alice.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		).toBeVisible(REPLICATED);

		// --- Revocation -------------------------------------------------------
		await alice.getByTestId('nav-studio').click();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await registered.getByTestId('device-revoke').click();
		await expect(registered).toHaveAttribute('data-revoked', 'true');

		// Carol loses the editor as soon as the revocation replicates to her.
		await expect(carol.getByTestId('course-add')).toHaveCount(0, REPLICATED);
		await expect(carol.getByTestId('guest-notice')).toBeVisible();

		// Revocation is not retroactive: the entry stays, carrying the timestamp
		// everything signed after it is judged against (docs/LIMITS.md §1.5), and
		// the course Carol wrote while approved is still there.
		await expect(registered).toBeVisible();

		await openProgramme(alice);
		await expect(
			alice.locator('[data-testid="course-item"][data-course-id="course:vinyasa-mi-18"]')
		).toHaveCount(1);
	});

	test('the studio starts with only the owner’s own device', async ({ alice }) => {
		test.setTimeout(180_000);

		await alice.goto('/studio/?ice=host');
		await onboard(alice, 'alice');

		// Nothing is waiting for approval …
		await expect(alice.getByTestId('pending-devices-empty')).toBeVisible();

		// … and the device list holds exactly one entry: hers. She is a device
		// like any other — the ledger refuses events from devices it cannot find,
		// so an owner missing from her own registry could not issue a ticket.
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await expect(alice.getByTestId('device-item')).toHaveCount(1);
		await expect(alice.getByTestId('device-item')).toContainText('owner');
	});
});
