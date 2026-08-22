// Saying when a save has landed.
//
// Naming a studio is about a second of awaited work — the document, the owner's
// device entry, then a read back from the registry, each of them signed — and
// the screen used to say nothing for the whole of it. The name field is bound to
// the form rather than to what was stored, so it goes on showing what was typed
// whether or not anything was written. The app looked finished while it was not.
//
// At a counter that is a real loss, if a narrow one: type the name, press save,
// lock the phone. Nothing said that leaving now would cost the write. #86.
//
// So the test reloads at once, waiting on nothing but the signal the screen
// gives. If that signal can be trusted, this passes with no sleep anywhere in it
// — and a sleep is precisely what it must not need, because a person does not
// have one either.

import { expect, onboard as onboardVia, test } from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('saving a studio', () => {
	test('says when it has landed, and it has', async ({ alice }) => {
		test.setTimeout(300_000);

		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
		await onboardVia(alice, 'solo');

		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		// The only wait in this test, and it is the one a person gets too.
		await expect(alice.getByTestId('studio-save-state')).toHaveAttribute(
			'data-state',
			'saved',
			READY
		);

		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('studio-name')).toHaveValue('Yoga Eggenfelden', READY);
	});

	test('will not take a second press while the first is running', async ({ alice }) => {
		// Not politeness: the handler is async and the button sat enabled through
		// all of it, so a second press started a second signed write of the same
		// document while the first was still going.
		test.setTimeout(300_000);

		await alice.goto('/studio/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible(READY);
		await onboardVia(alice, 'solo');

		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await expect(alice.getByTestId('studio-save')).toBeDisabled();
		await expect(alice.getByTestId('studio-save-state')).toHaveAttribute(
			'data-state',
			'saved',
			READY
		);
		await expect(alice.getByTestId('studio-save')).toBeEnabled();
	});
});
