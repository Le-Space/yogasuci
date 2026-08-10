<script>
	/**
	 * The till — selling a pass for cash (docs/PLAN.md §4.2).
	 *
	 * Only ever shown to a studio device, and only for students whose ledger this
	 * device actually holds: selling into a ledger you cannot see would produce a
	 * ticket nobody can verify.
	 *
	 * "Bar erhalten" writes one `issue` event, signed by this device. That event
	 * *is* the ticket — there is no second record to keep in step, and no balance
	 * field that could ever disagree with the log.
	 */
	import CounterOnly from '$lib/components/CounterOnly.svelte';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import { localized, packagesStore } from '$lib/db/program.js';
	import { devicesStore, locationsStore } from '$lib/db/registry.js';
	import { issueTicket, studentTicketsStore, transferTickets } from '$lib/db/tickets.js';
	import { foldStudentLedger } from '$lib/db/ledger-view.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let error = $state('');
	let sold = $state('');
	let studentDid = $state('');
	let packageId = $state('');

	let transferFrom = $state('');
	let transferTo = $state('');
	let transferred = $state(/** @type {{ moved: number, failedVoids: string[] } | null} */ (null));

	/**
	 * A lost passkey means a lost DID, and a paid balance that still has to exist.
	 *
	 * Both sides have to be devices this counter can already see: the new one has to
	 * have introduced itself, and the old ledger has to be open here or there is
	 * nothing to read a balance from.
	 */
	async function transfer(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		transferred = null;

		await run(async () => {
			if (transferFrom === transferTo) throw new Error(m.transfer_same());

			const from = $studentTicketsStore.get(transferFrom);
			const to = $studentTicketsStore.get(transferTo);
			if (!from || !to) throw new Error('Both devices have to be paired with this counter.');

			const folded = await foldStudentLedger(transferFrom);
			if (!folded) throw new Error('That ledger is not open here.');

			const own = $ownDidStore ?? '';
			const device = $devicesStore.find((entry) => entry.deviceDid === own);

			transferred = await transferTickets({
				fromDb: from.db,
				toDb: to.db,
				toStudentDid: transferTo,
				state: folded.state,
				by: { deviceDid: own, locationId: device?.locationId ?? '' }
			});
		});
	}

	let students = $derived([...$studentTicketsStore.values()]);

	/** The studio's location when it has exactly one, otherwise nothing. */
	function onlyLocationId() {
		const active = $locationsStore.filter((location) => location.active !== false);
		return active.length === 1 ? active[0]._id : '';
	}

	/** @param {() => Promise<void>} action */
	async function run(action) {
		error = '';
		try {
			await action();
		} catch (/** @type {any} */ cause) {
			error = cause?.message ?? String(cause);
		}
	}

	async function sell(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		sold = '';

		await run(async () => {
			const student = $studentTicketsStore.get(studentDid);
			const pkg = $packagesStore.find((entry) => entry._id === packageId);
			if (!student || !pkg) throw new Error('Pick a student and a pass.');

			// Checked here too, not only in the list: a second device may have
			// retired the pass while this one had it selected, and replication
			// arrives without asking whether a form is open.
			if (pkg.active === false) throw new Error('That pass is no longer sold.');

			const own = $ownDidStore ?? '';
			const device = $devicesStore.find((entry) => entry.deviceDid === own);

			await issueTicket({
				db: student.db,
				studentDid,
				package: pkg,
				issuedBy: {
					deviceDid: own,
					// The owner's device is registered without a location — she is not
					// tied to one. With a single location there is still only one place
					// this sale can have happened, so saying so beats leaving it blank:
					// a blank splits her row in the cash report and makes the takings
					// harder to read than they need to be. With several locations it
					// stays blank rather than guessing, and the report shows "—".
					locationId: device?.locationId || onlyLocationId()
				},
				today: new Date().toISOString().slice(0, 10)
			});

			sold = localized(pkg.name, getLocale());
		});
	}
</script>

<h1 class="text-3xl font-bold">{m.till_title()}</h1>

<StudioGate>
	<CounterOnly>
		{#if error}
			<p class="mt-4 text-danger" role="alert" data-testid="till-error">
				{m.error_generic({ reason: error })}
			</p>
		{/if}

		{#if sold}
			<p class="mt-4 text-success" data-testid="till-sold">{m.till_sold({ package: sold })}</p>
		{/if}

		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			{#if students.length === 0}
				<p class="text-faint" data-testid="till-empty">{m.till_none()}</p>
			{:else}
				<form class="grid max-w-lg gap-3" onsubmit={sell}>
					<label class="grid gap-1 text-sm">
						{m.till_student()}
						<select
							data-testid="till-student"
							bind:value={studentDid}
							required
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each students as student (student.did)}
								<option value={student.did}>{student.did.slice(-12)}</option>
							{/each}
						</select>
					</label>

					<label class="grid gap-1 text-sm">
						{m.till_package()}
						<select
							data-testid="till-package"
							bind:value={packageId}
							required
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							<!-- Retired passes drop out of the list. `!== false` rather than
							     `=== true`: passes created before the field existed have no
							     `active` at all, and they are still on sale. -->
							{#each $packagesStore.filter((pkg) => pkg.active !== false) as pkg (pkg._id)}
								<option value={pkg._id}>
									{localized(pkg.name, getLocale())} · {pkg.priceEUR} EUR
								</option>
							{/each}
						</select>
					</label>

					<button
						type="submit"
						data-testid="till-sell"
						class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
					>
						{m.till_cash_received()}
					</button>
				</form>
			{/if}
		</section>

		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			<h2 class="eyebrow">{m.transfer_title()}</h2>
			<p class="mt-1 text-sm text-muted">{m.transfer_intro()}</p>

			<form class="mt-3 grid max-w-lg gap-3" onsubmit={transfer}>
				<label class="grid gap-1 text-sm">
					{m.transfer_from()}
					<select
						data-testid="transfer-from"
						bind:value={transferFrom}
						required
						class="rounded-control border p-2"
					>
						<option value="" disabled></option>
						{#each students as student (student.did)}
							<option value={student.did}>{student.did.slice(-12)}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-1 text-sm">
					{m.transfer_to()}
					<select
						data-testid="transfer-to"
						bind:value={transferTo}
						required
						class="rounded-control border p-2"
					>
						<option value="" disabled></option>
						{#each students as student (student.did)}
							<option value={student.did}>{student.did.slice(-12)}</option>
						{/each}
					</select>
				</label>

				<button
					type="submit"
					data-testid="transfer-submit"
					class="justify-self-start rounded-control border border-border px-4 py-2 text-sm"
				>
					{m.transfer_submit()}
				</button>
			</form>

			{#if transferred}
				<p class="mt-2 text-sm text-success" data-testid="transfer-done">
					{m.transfer_done({ count: transferred.moved })}
				</p>

				<!--
					The one failure worth shouting about: the balance now exists on both
					ledgers, and only a person can put that right.
				-->
				{#if transferred.failedVoids.length > 0}
					<p class="mt-2 text-sm text-danger" data-testid="transfer-void-failed" role="alert">
						{m.transfer_void_failed({ count: transferred.failedVoids.length })}
					</p>
				{/if}
			{/if}
		</section>
	</CounterOnly>
</StudioGate>
