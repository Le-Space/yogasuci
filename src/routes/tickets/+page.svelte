<script>
	/**
	 * My passes — the balance, folded from this device's own ledger.
	 *
	 * No demo data any more: what is shown is the result of `reduceLedger` over
	 * the events that actually replicated here, with signatures verified against
	 * the registry. A ticket sold at the counter appears because its `issue`
	 * event arrived, not because anything was told to display it.
	 */
	import TicketCard from '$lib/components/TicketCard.svelte';
	import { reduceLedger } from '$lib/ledger';
	import { verifySignatures } from '$lib/db/ledger-signing.js';
	import { deviceRegistry } from '$lib/db/registry.js';
	import { ticketEventsStore } from '$lib/db/tickets.js';
	import { devicesStore } from '$lib/db/registry.js';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import { buildExport, countEvents, downloadExport, exportFilename } from '$lib/db/export.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { waitingForKeys } from '$lib/db/encrypted-open.js';
	import { ticketLedgerName } from '$lib/db/tickets.js';
	import * as m from '$lib/paraglide/messages.js';

	let tickets = $state(/** @type {any[]} */ ([]));
	let exported = $state(/** @type {number | null} */ (null));

	/**
	 * The student's own copy, as signed events.
	 *
	 * Only their own ledger — a student has no business exporting the studio's
	 * registry, and `buildExport` leaves out what it was not handed rather than
	 * shipping empty fields that would imply it asked.
	 */
	function exportOwn() {
		const did = $ownDidStore ?? '';
		const exportedAt = new Date().toISOString();
		const bundle = buildExport({
			exportedBy: did,
			exportedAt,
			ledgers: { [did]: $ticketEventsStore }
		});

		downloadExport(bundle, exportFilename('yoga-passes', exportedAt));
		exported = countEvents(bundle);
	}

	// Signature verification is asynchronous and the reducer must stay pure, so
	// every event is verified first and the verdicts handed over as a lookup.
	$effect(() => {
		const events = $ticketEventsStore;
		void $devicesStore;

		let cancelled = false;

		(async () => {
			const isSignatureValid = await verifySignatures(events);
			if (cancelled) return;

			const state = reduceLedger(events, {
				devices: deviceRegistry(),
				isSignatureValid,
				today: new Date().toISOString().slice(0, 10)
			});

			tickets = [...state.tickets.values()];
		})();

		return () => {
			cancelled = true;
		};
	});

	// Named for this device's own ledger rather than "anything is waiting": a
	// counter can be waiting for one student's books while reading another's.
	let waitingForOwnLedger = $derived(
		Boolean($ownDidStore) && $waitingForKeys.has(ticketLedgerName($ownDidStore ?? ''))
	);
</script>

<h1 class="text-3xl font-bold">{m.nav_tickets()}</h1>

<StudioGate>
	<!--
		Two ways to have no passes on screen, and they need opposite answers. Not
		having bought one is a fact. Not being able to read the ledger yet is a
		wait, and saying "no passes bought" there would be a lie told to the one
		person who knows they bought one (#95).
	-->
	{#if waitingForOwnLedger}
		<p class="mt-6 text-muted" data-testid="tickets-waiting">{m.tickets_waiting_for_key()}</p>
	{:else if tickets.length === 0}
		<p class="mt-6 text-faint" data-testid="tickets-empty">{m.tickets_none()}</p>
	{:else}
		<div class="mt-6 grid gap-4">
			{#each tickets as ticket (ticket.ticketId)}
				<TicketCard state={ticket} />
			{/each}
		</div>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.export_title()}</h2>
		<p class="mt-1 text-sm text-muted">{m.export_intro()}</p>

		<button
			type="button"
			data-testid="export-own"
			onclick={exportOwn}
			class="mt-3 rounded-control border border-border px-4 py-2 text-sm"
		>
			{m.export_own()}
		</button>

		{#if exported !== null}
			<p class="mt-2 text-sm text-success" data-testid="export-done">
				{m.export_done({ count: exported })}
			</p>
		{/if}
	</section>
</StudioGate>
