// Two passkeys on one device.
//
// A phone at the counter and a phone in a bag can be the same phone. Its owner
// runs a studio and takes classes somewhere else, so it holds a studio passkey
// and a personal one — an ordinary arrangement the app had no notion of.
//
// Nothing kept the two apart. The credential, the database addresses, the joined
// studios and the OrbitDB stores each had one fixed name, so signing in with the
// second passkey left the *first* account's studio open underneath the second
// account's identity. `isOwnStudio()` compared the studio's owner against the
// wrong DID and correctly answered no, which arrived on screen as "you are
// viewing this studio as a guest" — on the very device that had created it.
//
// So what is pinned here is not a label. It is that a second account cannot
// reach the first one's studio at all.

import { expect, onboard as onboardVia, test } from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('a device with two passkeys on it', () => {
	test('does not open the studio account’s studio under the personal one', async ({ alice }) => {
		test.setTimeout(300_000);

		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
		await onboardVia(alice, 'studio');

		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await expect(alice.getByTestId('studio-name')).toHaveValue('Yoga Eggenfelden', READY);

		// A second passkey, the way a person gets one: the gate offers to make a
		// new one whenever this browser has no credential to come back to. Driven
		// through storage rather than through "switch account" because the switch
		// ends in the platform's own passkey chooser, which a virtual authenticator
		// does not put under a test's control (docs/LIMITS.md §2.5). The situation
		// it produces is identical — a second DID on one device — and that is what
		// this is about.
		const studioDid = await alice.getByTestId('studio-ready').getAttribute('data-did');

		await alice.evaluate(() => localStorage.removeItem('yoga-p2p.passkeyCredential'));
		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
		await onboardVia(alice, 'personal');

		// Genuinely a second account, not the same one twice. Without this the
		// assertion below could pass on a device that simply failed to boot.
		const personalDid = await alice.getByTestId('studio-ready').getAttribute('data-did');
		expect(personalDid).toBeTruthy();
		expect(personalDid).not.toBe(studioDid);

		// And the studio did not come with it. An empty field rather than an absent
		// one: the screen for a device without a studio is the screen offering to
		// create one, and before this it arrived pre-filled with a studio this
		// account has nothing to do with — which is the whole of #82.
		await expect(alice.getByTestId('studio-name')).toHaveValue('', READY);

		// Deliberately *not* asserted on `guest-notice`. It is drawn whenever
		// `$studioStore` is empty, so a device with no studio at all is told it is a
		// guest in one — wrong, but wrong independently of accounts, and using it
		// here would tie this test to a bug it is not about.
	});

	test('gives the studio account its studio back', async ({ alice }) => {
		test.setTimeout(300_000);

		// The other half, and the one that would catch a fix that "works" by
		// throwing the first account's data away: separation has to be separation,
		// not deletion.
		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
		await onboardVia(alice, 'studio');

		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();
		await expect(alice.getByTestId('studio-name')).toHaveValue('Yoga Eggenfelden', READY);

		const studioCredential = await alice.evaluate(() =>
			localStorage.getItem('yoga-p2p.passkeyCredential')
		);

		await alice.evaluate(() => localStorage.removeItem('yoga-p2p.passkeyCredential'));
		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
		await onboardVia(alice, 'personal');
		await expect(alice.getByTestId('studio-name')).toHaveValue('', READY);

		// Signing back in as the studio. Restoring the credential is what the
		// platform chooser does for a person: it hands back one of the passkeys this
		// site already has.
		await alice.evaluate((credential) => {
			if (credential) localStorage.setItem('yoga-p2p.passkeyCredential', credential);
		}, studioCredential);
		await alice.goto('/studio/?ice=host');

		await expect(alice.getByTestId('studio-name')).toHaveValue('Yoga Eggenfelden', READY);
	});
});
