// More than one device at a time, and visibly so.
//
// The connection screen could always hold several peers — libp2p keeps every
// connection it upgraded, and `connectedPeersStore` has counted all of them for
// as long as it has existed. What it could not do is *say* so: one line naming
// the first peer id, so a front desk with a teacher and two students on it
// looked exactly like a front desk with one, and there was no way to end one of
// those connections without ending all three.
//
// So these tests are about what a person at the counter can see and do, not
// about whether the transport supports a mesh. It already did.

import { test, expect, connectViaPaste, openConnect } from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('a front desk with more than one device on it', () => {
	test('shows both, and lets one go without dropping the other', async ({ alice, bob, carol }) => {
		// Three libp2p + Helia + OrbitDB stacks and two full handshakes.
		test.setTimeout(600_000);

		await connectViaPaste(alice, bob);
		await connectViaPaste(alice, carol);

		const list = alice.getByTestId('device-list');

		// Located by full peer id rather than by the text in the row: the element
		// shortens what it shows, and matching on `abc12345…xyz789` would be a test
		// of its formatting instead of of who is connected.
		const bobId = await bob.getByTestId('own-peer-id').innerText();
		const carolId = await carol.getByTestId('own-peer-id').innerText();
		const bobRow = list.locator(`[data-peer="${bobId}"]`);
		const carolRow = list.locator(`[data-peer="${carolId}"]`);

		// Both. A count alone would pass while the screen still named only the
		// first one, which is the bug this replaces.
		await expect(bobRow).toBeVisible(READY);
		await expect(carolRow).toBeVisible(READY);
		await expect(alice.getByTestId('connection-status')).toContainText('2');

		// --- one leaves ------------------------------------------------------
		// The student walks out; the teacher's tablet stays. Before this, the only
		// control was "end connection", which took both.
		await carolRow.getByRole('button').click();

		await expect(carolRow).toHaveCount(0, READY);
		await expect(bobRow).toBeVisible();
		await expect(alice.getByTestId('connection-status')).toHaveAttribute(
			'data-step',
			'connected',
			READY
		);
	});

	test('says nothing about devices when none are connected', async ({ alice }) => {
		await openConnect(alice, 'alice');

		await expect(alice.getByTestId('devices')).toHaveCount(0);
	});
});
