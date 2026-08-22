<script>
	/**
	 * Registry editor: the studio, its locations and its devices
	 * (docs/PLAN.md §3.1, §9 "Inhaberin").
	 *
	 * Nothing here deletes. A location or device that ever appeared on a signed
	 * ticket event stays in the registry — deactivated or revoked — because the
	 * ledger verifies old events against it and the cash report is grouped by it.
	 */
	import StudioGate from '$lib/components/StudioGate.svelte';
	import {
		deactivateLocation,
		devicesStore,
		locationsStore,
		registerDevice,
		revokeDevice,
		saveLocation,
		saveStudio,
		studioStore
	} from '$lib/db/registry.js';
	import { localized } from '$lib/db/program.js';
	import { forgetPendingDevice, pendingDevicesStore } from '$lib/db/join.js';
	import { buildExport, countEvents, downloadExport, exportFilename } from '$lib/db/export.js';
	import { coursesStore, packagesStore } from '$lib/db/program.js';
	import { studentTicketsStore } from '$lib/db/tickets.js';
	import { bookingsStore } from '$lib/db/bookings.js';
	import { resolve } from '$app/paths';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let studioName = $state('');
	let error = $state('');
	let exported = $state(/** @type {number | null} */ (null));

	/**
	 * A studio running on one device has no backup of its registry.
	 *
	 * Asked for rather than suggested: if that device is lost, nobody can approve or
	 * revoke anything ever again, and every ledger address in this studio derives
	 * from the owner DID it held (src/lib/db/studio-acl.js). The plan calls for the
	 * setup to demand this, so it stays on screen until a second device exists
	 * instead of being a hint somebody dismisses once.
	 */
	let needsSecondDevice = $derived(
		Boolean($studioStore?.ownerDid) &&
			$devicesStore.filter((device) => !device.revokedAt).length < 2
	);

	function exportStudio() {
		const exportedAt = new Date().toISOString();
		const bundle = buildExport({
			exportedBy: $ownDidStore ?? '',
			exportedAt,
			studio: $studioStore,
			locations: $locationsStore,
			devices: $devicesStore,
			packages: $packagesStore,
			courses: $coursesStore,
			bookings: $bookingsStore,
			// Every ledger this device holds, as signed events. A studio's own copy is
			// the only backup of a student's balance that survives losing their phone.
			ledgers: Object.fromEntries(
				[...$studentTicketsStore.values()].map((student) => [student.did, student.events])
			)
		});

		downloadExport(bundle, exportFilename('yoga-studio', exportedAt));
		exported = countEvents(bundle);
	}

	let location = $state({ id: '', nameDe: '', nameEn: '', address: '' });

	const ROLES = [
		{ value: 'front-desk', label: () => m.pending_device_role_frontdesk() },
		{ value: 'teacher', label: () => m.pending_device_role_teacher() },
		{ value: 'owner', label: () => m.pending_device_role_owner() }
	];

	/**
	 * Per-device form state, keyed by DID.
	 *
	 * Seeded in an effect rather than on demand from the template: Svelte cannot
	 * bind to a function call, so each draft has to exist as a plain property
	 * before the form renders.
	 */
	let drafts = $state(
		/** @type {Record<string, { role: string, locationId: string, label: string }>} */ ({})
	);

	$effect(() => {
		for (const did of $pendingDevicesStore.keys()) {
			if (!drafts[did]) drafts[did] = { role: 'front-desk', locationId: '', label: '' };
		}
	});

	/** @param {{ did: string, label: string, publicKey?: string }} device */
	async function approve(device) {
		const draft = drafts[device.did];

		await run(async () => {
			await registerDevice({
				deviceDid: device.did,
				role: /** @type {any} */ (draft.role),
				locationId: draft.locationId,
				// Without it the ledger cannot verify anything this device signs.
				publicKey: device.publicKey ?? '',
				// Falls back to what the device reported about itself, trimmed.
				label: draft.label || device.label || device.did.slice(-8)
			});
			forgetPendingDevice(device.did);
		});
	}

	// The studio document arrives asynchronously; seed the field once it does,
	// without clobbering what the user is typing.
	let seeded = false;
	$effect(() => {
		if (!seeded && $studioStore?.name) {
			studioName = $studioStore.name;
			seeded = true;
		}
	});

	/**
	 * Which write is in flight, and which one last finished.
	 *
	 * Both are on screen, and that is the whole point of them. Saving a studio is
	 * roughly a second of awaited work — the document, the owner's device entry,
	 * then a read back from the registry, each of them signed — and until this
	 * existed the screen said nothing for the whole of it. The field kept showing
	 * what had been typed, because it is bound to the form rather than to what was
	 * stored, so the app looked finished while it was not. Leaving then, by
	 * reloading or by locking the phone, lost the write and nothing had warned
	 * that it might (#86).
	 */
	let busy = $state('');
	let settled = $state('');

	/**
	 * @param {() => Promise<void>} action
	 * @param {string} [what] names the form this belongs to, so two forms on one
	 *   page do not report each other's progress
	 */
	async function run(action, what = '') {
		error = '';
		busy = what;
		settled = '';
		try {
			await action();
			// Only now, and only because the actions above end by reading the
			// registry back — this says "it is stored", not "the click was handled".
			settled = what;
		} catch (/** @type {any} */ cause) {
			error = cause?.message ?? String(cause);
		} finally {
			busy = '';
		}
	}

	/** @param {string} what */
	function stateOf(what) {
		if (busy === what) return 'saving';
		if (settled === what) return 'saved';
		return 'idle';
	}

	async function submitStudio(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		await run(() => saveStudio({ name: studioName }), 'studio');
	}

	async function submitLocation(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		await run(async () => {
			await saveLocation({
				id: location.id,
				name: { de: location.nameDe, en: location.nameEn || location.nameDe },
				address: location.address
			});
			location = { id: '', nameDe: '', nameEn: '', address: '' };
		});
	}
</script>

<h1 class="text-3xl font-bold">{m.studio_title()}</h1>

<StudioGate>
	{#if error}
		<p class="mt-4 text-danger" role="alert" data-testid="studio-error">
			{m.error_generic({ reason: error })}
		</p>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.studio_title()}</h2>

		<form class="mt-3 grid max-w-md gap-3" onsubmit={submitStudio}>
			<label class="grid gap-1 text-sm">
				{m.studio_name()}
				<input
					data-testid="studio-name"
					bind:value={studioName}
					required
					class="rounded-control border p-2"
				/>
			</label>
			<button
				type="submit"
				data-testid="studio-save"
				disabled={stateOf('studio') === 'saving'}
				class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
			>
				{stateOf('studio') === 'saving' ? m.saving() : m.studio_save()}
			</button>

			<!--
				Said out loud, and readable by a test, because "it looked saved" was
				exactly the failure: the input keeps showing what was typed either way.
				`aria-live` so it is announced rather than only drawn — somebody who
				cannot see the button greying out has no other sign that anything is
				happening.
			-->
			<p
				class="text-sm text-muted"
				data-testid="studio-save-state"
				data-state={stateOf('studio')}
				aria-live="polite"
			>
				{stateOf('studio') === 'saving'
					? m.saving()
					: stateOf('studio') === 'saved'
						? m.saved()
						: ''}
			</p>
		</form>

		<p class="mt-3 font-mono text-xs break-all text-faint" data-testid="owner-did">
			{m.studio_owner()}: {$studioStore?.ownerDid ?? $ownDidStore ?? '…'}
		</p>
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.locations_title()}</h2>

		<ul class="mt-3 grid gap-2" data-testid="location-list">
			{#each $locationsStore as entry (entry._id)}
				<li
					class="flex items-baseline gap-3 border-b border-border pb-2"
					data-testid="location-item"
					data-location-id={entry._id}
					data-active={entry.active}
				>
					<span class="flex-1">
						{localized(entry.name, getLocale())}
						{#if !entry.active}
							<span class="text-faint">· {m.location_inactive()}</span>
						{/if}
					</span>
					{#if entry.active}
						<button
							type="button"
							data-testid="location-deactivate"
							onclick={() => run(() => deactivateLocation(entry._id))}
							class="rounded-control border border-border px-2 py-1 text-sm"
						>
							{m.location_deactivate()}
						</button>
					{/if}
				</li>
			{:else}
				<li class="text-faint" data-testid="location-empty">{m.location_none()}</li>
			{/each}
		</ul>

		<form class="mt-4 grid max-w-md gap-3" onsubmit={submitLocation}>
			<label class="grid gap-1 text-sm">
				{m.location_id()}
				<input
					data-testid="location-id"
					bind:value={location.id}
					required
					pattern="[a-z0-9\-]+"
					class="rounded-control border p-2"
				/>
			</label>
			<label class="grid gap-1 text-sm">
				{m.location_name_de()}
				<input
					data-testid="location-name-de"
					bind:value={location.nameDe}
					required
					class="rounded-control border p-2"
				/>
			</label>
			<label class="grid gap-1 text-sm">
				{m.location_name_en()}
				<input
					data-testid="location-name-en"
					bind:value={location.nameEn}
					class="rounded-control border p-2"
				/>
			</label>
			<label class="grid gap-1 text-sm">
				{m.location_address()}
				<input
					data-testid="location-address"
					bind:value={location.address}
					class="rounded-control border p-2"
				/>
			</label>
			<button
				type="submit"
				data-testid="location-add"
				class="justify-self-start rounded-control border border-border px-4 py-2"
			>
				{m.location_add()}
			</button>
		</form>
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.pending_devices_title()}</h2>

		{#each [...$pendingDevicesStore.values()].filter((d) => drafts[d.did]) as device (device.did)}
			<form
				class="mt-4 grid max-w-lg gap-3 border-b border-border pb-4"
				data-testid="pending-device"
				data-device-did={device.did}
				onsubmit={(event) => {
					event.preventDefault();
					approve(device);
				}}
			>
				<p class="font-mono text-xs break-all text-faint">{device.did}</p>

				<div class="grid grid-cols-2 gap-3">
					<label class="grid gap-1 text-sm">
						{m.pending_device_role()}
						<select
							data-testid="pending-device-role"
							bind:value={drafts[device.did].role}
							class="rounded-control border p-2"
						>
							{#each ROLES as role (role.value)}
								<option value={role.value}>{role.label()}</option>
							{/each}
						</select>
					</label>

					<label class="grid gap-1 text-sm">
						{m.pending_device_location()}
						<select
							data-testid="pending-device-location"
							bind:value={drafts[device.did].locationId}
							required
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each $locationsStore.filter((entry) => entry.active) as entry (entry._id)}
								<option value={entry._id}>{localized(entry.name, getLocale())}</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="grid gap-1 text-sm">
					{m.pending_device_label()}
					<input
						data-testid="pending-device-label"
						bind:value={drafts[device.did].label}
						class="rounded-control border p-2"
					/>
					<span class="text-xs text-faint">{m.pending_device_hint()}</span>
				</label>

				<button
					type="submit"
					data-testid="pending-device-register"
					class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
				>
					{m.pending_device_register()}
				</button>
			</form>
		{:else}
			<p class="mt-3 text-faint" data-testid="pending-devices-empty">{m.pending_devices_none()}</p>
		{/each}
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.devices_title()}</h2>

		<ul class="mt-3 grid gap-2" data-testid="device-list">
			{#each $devicesStore as device (device._id)}
				<li
					class="flex items-baseline gap-3 border-b border-border pb-2"
					data-testid="device-item"
					data-device-did={device.deviceDid}
					data-revoked={Boolean(device.revokedAt)}
				>
					<span class="flex-1">
						{device.label}
						<span class="text-faint">· {device.role} · {device.locationId}</span>
						{#if device.revokedAt}
							<span class="text-danger">· {m.device_revoked()}</span>
						{/if}
					</span>
					{#if !device.revokedAt}
						<button
							type="button"
							data-testid="device-revoke"
							onclick={() => run(() => revokeDevice(device.deviceDid))}
							class="rounded-control border border-border px-2 py-1 text-sm"
						>
							{m.device_revoke()}
						</button>
					{/if}
				</li>
			{:else}
				<!-- Pairing is M2 (T2.3); until then this list is empty by design. -->
				<li class="text-faint" data-testid="device-empty">{m.device_none()}</li>
			{/each}
		</ul>
	</section>
	{#if needsSecondDevice}
		<section
			class="mt-6 rounded-card border border-warning bg-surface p-6"
			data-testid="second-device-warning"
			role="alert"
		>
			<h2 class="eyebrow text-warning">{m.second_device_title()}</h2>
			<p class="mt-1 text-sm text-muted">{m.second_device_body()}</p>
			<a
				href={resolve('/connect')}
				data-testid="second-device-action"
				class="mt-3 inline-block rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-contrast no-underline"
			>
				{m.second_device_action()}
			</a>
		</section>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.export_title()}</h2>
		<p class="mt-1 text-sm text-muted">{m.export_intro()}</p>

		<button
			type="button"
			data-testid="export-studio"
			onclick={exportStudio}
			class="mt-3 rounded-control border border-border px-4 py-2 text-sm"
		>
			{m.export_studio()}
		</button>

		{#if exported !== null}
			<p class="mt-2 text-sm text-success" data-testid="export-done">
				{m.export_done({ count: exported })}
			</p>
		{/if}
	</section>
</StudioGate>
