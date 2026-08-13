<script>
	/**
	 * What this device knows, and how current it is (T5.1).
	 *
	 * Without a server there is no authoritative "now", so every screen has to be
	 * honest about the difference between "nobody has booked that class" and "nobody
	 * has told me about it". This strip is that difference, made visible everywhere
	 * rather than only on the ticket card.
	 *
	 * Deliberately reports observations, not conclusions: how many peers are
	 * connected right now, and when each database last changed *here*. It never
	 * claims the data is up to date — nothing on a disconnected device can know that.
	 */
	import { databaseStatusStore } from '$lib/db/open.js';
	import { connectedPeersStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let peers = $derived($connectedPeersStore.length);

	// The newest inbound sync across all open databases. Peers connected says two
	// devices found each other; this says something actually crossed — which is
	// the question somebody at a counter is really asking, and the one the bar
	// could not answer before.
	let lastReceived = $derived(
		$databaseStatusStore.reduce(
			(/** @type {string | null} */ newest, row) =>
				row.syncedAt && (!newest || row.syncedAt > newest) ? row.syncedAt : newest,
			null
		)
	);

	// The oldest database is the one that limits what this device can be sure of,
	// so it is the one the summary line reports. Taking the newest would flatter
	// the device: one busy database would hide four stale ones.
	let oldestChange = $derived(
		$databaseStatusStore.reduce(
			(/** @type {string | null} */ oldest, row) =>
				!row.changedAt || (oldest && oldest <= row.changedAt) ? oldest : row.changedAt,
			null
		)
	);

	/** @param {string | null} at */
	function formatTime(at) {
		if (!at) return '—';
		return new Date(at).toLocaleString(getLocale(), {
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}
</script>

<section
	class="border-b border-border bg-bg px-4 py-2 text-xs"
	data-testid="sync-status"
	data-peers={peers}
	aria-label={m.sync_status_title()}
>
	<div class="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1">
		{#if peers > 0}
			<span class="text-success" data-testid="sync-peers">{m.sync_peers({ count: peers })}</span>
		{:else}
			<!--
				The alone case gets the emphasis, because it is the one that changes what
				a person should conclude from the screen behind it.
			-->
			<span class="text-warning" data-testid="sync-alone">{m.sync_alone()}</span>
		{/if}

		<span class="text-faint" data-testid="sync-oldest">
			{m.sync_last_change({ time: formatTime(oldestChange) })}
		</span>

		<span class="text-faint" data-testid="sync-received" data-received={lastReceived ?? ''}>
			{lastReceived ? m.sync_received({ time: formatTime(lastReceived) }) : m.sync_received_never()}
		</span>

		{#if $databaseStatusStore.length > 0}
			<details class="ml-auto">
				<summary class="cursor-pointer text-faint" data-testid="sync-details-toggle">
					{m.sync_details()}
				</summary>
				<ul class="mt-2 space-y-1 font-mono text-faint">
					{#each $databaseStatusStore as row (row.address)}
						<li data-testid="sync-database" data-key={row.key}>
							{row.key} · {m.sync_entries({ count: row.entries })} · {formatTime(row.changedAt)}
							{#if row.syncedAt}
								· {m.sync_received({ time: formatTime(row.syncedAt) })}
							{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>
</section>
