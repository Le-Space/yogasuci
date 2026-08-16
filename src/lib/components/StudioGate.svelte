<script>
	/**
	 * Wraps any screen that needs an identity and open databases.
	 *
	 * On load it restores a known passkey silently — a reload must not cost a
	 * WebAuthn interaction. Only a device with no passkey at all sees the
	 * onboarding form.
	 */
	import { onMount } from 'svelte';
	import {
		bootStore,
		bootIfIdentityKnown,
		createIdentityAndBoot,
		recoverIdentityAndBoot,
		studioReady
	} from '$lib/identity/onboarding.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// WebAuthn takes an account name and a display name. Both are labels for the
	// credential picker, neither identifies the passkey, so the screen asks once
	// and gives the same answer to both.
	let name = $state('');

	onMount(async () => {
		try {
			await bootIfIdentityKnown();
		} catch {
			// The error is already in bootStore; the form below offers a retry.
		}
	});

	async function create(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		try {
			await createIdentityAndBoot({ userId: name, displayName: name });
		} catch {
			// surfaced through bootStore
		}
	}

	async function recover() {
		try {
			await recoverIdentityAndBoot();
		} catch {
			// surfaced through bootStore
		}
	}
</script>

{#if $studioReady}
	<div data-testid="studio-ready" data-did={$ownDidStore}>
		{@render children?.()}
	</div>
{:else}
	<section class="rounded-card border border-border bg-surface p-6" data-testid="onboarding">
		<h2 class="eyebrow">{m.onboarding_title()}</h2>

		{#if $bootStore.state === 'starting'}
			<p class="mt-3 text-muted" data-testid="onboarding-busy">{m.onboarding_busy()}</p>
		{:else}
			<p class="mt-3 max-w-xl text-muted">{m.onboarding_intro()}</p>

			{#if $bootStore.state === 'error'}
				<p class="mt-3 text-danger" data-testid="onboarding-error" role="alert">
					{m.error_generic({ reason: $bootStore.error ?? '' })}
				</p>
			{/if}

			<form class="mt-4 grid max-w-md gap-3" onsubmit={create}>
				<!--
					One field now. It used to be two because the first one was not a
					label at all: the provider built the WebAuthn user handle out of it,
					and an authenticator replaces a credential whose handle matches, so
					two people creating a passkey on one front-desk device under the same
					name meant the second destroyed the first. The handle is random since
					Le-Space/orbitdb-identity-provider-webauthn-did#45, which leaves a
					name that is only a name — and one name is all this screen ever had
					to ask for.
				-->
				<label class="grid gap-1 text-sm">
					{m.onboarding_user_id()}
					<input
						data-testid="onboarding-user-id"
						bind:value={name}
						required
						autocomplete="username"
						aria-describedby="user-id-hint"
						class="rounded-control border p-2"
					/>
					<span id="user-id-hint" class="text-xs text-muted" data-testid="onboarding-user-id-hint">
						{m.onboarding_user_id_hint()}
					</span>
				</label>

				<button
					type="submit"
					data-testid="onboarding-submit"
					class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
				>
					{m.onboarding_create()}
				</button>

				<!--
					The consequence, next to the button that causes it.

					This screen appears whenever local storage holds no credential, and
					that is two different situations wearing the same face: a genuinely
					new device, and one whose storage was cleared — a new browser, a
					wiped profile, a passkey synced from elsewhere. In the second, the
					top button is the wrong one, and pressing it does not fail: it makes
					a *second* passkey and therefore a second DID, under which the
					studio does not know this device and its old passes are unreachable.

					A browser will not tell us which situation this is — it never reveals
					whether a passkey exists without a gesture, on purpose. So the choice
					cannot be made for the person, and the only honest help is to name
					what each button does before they press one.
				-->
				<p class="mt-2 max-w-md text-sm text-muted" data-testid="onboarding-create-warning">
					{m.onboarding_create_warning()}
				</p>
			</form>

			<!--
				No advice about a second owner device here, and that was a real defect:
				this gate wraps *every* route, so a student setting up their phone was
				told to register a second device "as the owner" and that their passkey
				was "the studio's key". At this moment nothing knows which it is — the
				role is decided later, by creating a studio or joining one. The demand
				lives on /studio instead, where the registry answers the question.

				Recovering is offered unconditionally, and that was a real gap: it used to
				appear only when local storage still remembered a credential — which is
				never true on the device somebody reaches for *after* losing the last one.
				A passkey lives in the authenticator and can be synced or carried, so the
				new phone has to be allowed to ask. It costs one WebAuthn prompt and fails
				with a plain "No passkey found on this device."
			-->
			<button
				type="button"
				data-testid="recover-identity"
				onclick={recover}
				class="mt-4 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
			>
				{m.onboarding_recover()}
			</button>
		{/if}
	</section>
{/if}
