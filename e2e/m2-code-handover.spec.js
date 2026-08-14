// What the screen says while a code changes hands.
//
// The exchange has always worked. What it did not do is report on itself: the
// reply appeared in the same card in the same place as the invitation, with
// nothing marking it as a different thing; a successful scan was silent, so the
// only evidence the camera had got it was that the screen changed — which it
// also does when the invitation renews itself; and a code that had done its job
// stayed up, because the screen re-armed with the next invitation the moment a
// connection came up.
//
// Driven over paste rather than the camera, like the rest of the suite: it is
// the same code path, and a failure here is never ambiguous about which layer
// broke.

import { test, expect, openAdvanced, openConnect, readPayload } from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('handing a code over', () => {
	test('names the reply, acknowledges the read, and takes the code down', async ({
		alice,
		bob
	}) => {
		test.setTimeout(420_000);

		await openConnect(alice, 'alice');
		await openConnect(bob, 'bob');
		await openAdvanced(alice);
		await openAdvanced(bob);

		// --- before anything is read -----------------------------------------
		await expect(alice.getByTestId('code-card')).toHaveAttribute('data-kind', 'invite');
		await expect(bob.getByTestId('scan-accepted')).toHaveCount(0);

		// --- one device reads the other's invitation --------------------------
		const invite = await readPayload(alice);
		await bob.getByTestId('inbound-payload').fill(invite);
		await bob.getByTestId('submit-inbound').click();

		// The read is acknowledged. Without this the person holding the device
		// cannot tell a successful scan from an invitation that renewed itself.
		await expect(bob.getByTestId('scan-accepted')).toBeVisible(READY);

		// And the code it now shows is marked as a different code. Same card, same
		// place — the label is the only thing that says the meaning changed.
		await expect(bob.getByTestId('code-card')).toHaveAttribute('data-kind', 'reply', READY);
		await expect(bob.getByTestId('code-kind')).toHaveText('Reply');

		// --- the reply goes back ----------------------------------------------
		const reply = await readPayload(bob, { changedFrom: '' });
		await alice.getByTestId('inbound-payload').fill(reply);
		await alice.getByTestId('submit-inbound').click();

		await expect(alice.getByTestId('connection-status')).toHaveAttribute(
			'data-step',
			'connected',
			READY
		);
		await expect(bob.getByTestId('connection-status')).toHaveAttribute(
			'data-step',
			'connected',
			READY
		);

		// --- both codes come down ---------------------------------------------
		// This is the part that used to be wrong on both devices at once: each
		// went on holding up a code nobody was waiting for.
		await expect(alice.getByTestId('code-card')).toHaveCount(0, READY);
		await expect(bob.getByTestId('code-card')).toHaveCount(0, READY);

		// --- unless there is a next device ------------------------------------
		await alice.getByTestId('show-code').click();

		await expect(alice.getByTestId('code-card')).toHaveAttribute('data-kind', 'invite', READY);
		// A fresh invitation, not the spent one: an invitation can only be used
		// once, and this screen re-arms itself the moment a connection comes up.
		expect(await readPayload(alice)).not.toBe(invite);
	});
});
