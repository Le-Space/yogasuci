<script>
	/**
	 * Review a pasted setup document, then write the parts that were confirmed.
	 *
	 * The whole reason this screen exists is that the document came from an
	 * assistant reading a website, and such a document is not hostile but
	 * confidently wrong. Nothing here writes until somebody has looked.
	 *
	 * Not every field is editable, and that is deliberate rather than unfinished:
	 * the price, the number of visits and the validity are editable because those
	 * are what money depends on and what an assistant misreads. Everything else is
	 * fixed afterwards in the programme editor, which already exists and is the
	 * better tool for it. Rebuilding that editor inside a review screen would give
	 * two places to change a course and one of them would drift.
	 */
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { planImport, parseSetupText } from '$lib/db/import.js';
	import { buildSetupPrompt } from '$lib/db/setup-prompt.js';
	import {
		coursesStore,
		packagesStore,
		savePackage,
		saveRecurringCourse,
		saveSeriesCourse
	} from '$lib/db/program.js';
	import { locationsStore, saveLocation } from '$lib/db/registry.js';
	import * as m from '$lib/paraglide/messages.js';

	let siteUrl = $state('');
	let promptCopied = $state(false);
	let pasted = $state('');
	let error = $state('');
	let applied = $state(0);
	/** @type {any} */
	let plan = $state(null);
	/** Rows the reader unticked. Keyed `kind:id`. */
	let skipped = $state(/** @type {Record<string, boolean>} */ ({}));

	async function copyPrompt() {
		const locale = getLocale() === 'en' ? 'en' : 'de';
		await navigator.clipboard.writeText(buildSetupPrompt({ url: siteUrl, locale }));
		promptCopied = true;
		setTimeout(() => (promptCopied = false), 4000);
	}

	function review() {
		error = '';
		applied = 0;
		plan = null;
		skipped = {};

		try {
			plan = planImport(parseSetupText(pasted), {
				locations: $locationsStore,
				packages: $packagesStore,
				courses: $coursesStore
			});
		} catch (/** @type {any} */ problem) {
			error = problem?.message ?? String(problem);
		}
	}

	/** @param {string} key */
	function wanted(key) {
		return !skipped[key];
	}

	async function apply() {
		error = '';
		let count = 0;

		try {
			// Locations first: a course names one, and a course whose location does
			// not exist yet is a course nobody can book.
			for (const entry of plan.locations) {
				if (!wanted(`location:${entry.id}`)) continue;
				await saveLocation({ id: entry.id, name: entry.name, address: entry.address });
				count++;
			}

			for (const entry of plan.packages) {
				if (!wanted(`package:${entry.id}`)) continue;
				await savePackage(entry);
				count++;
			}

			for (const entry of plan.courses) {
				if (!wanted(`course:${entry.id}`)) continue;
				if (entry.mode === 'series') await saveSeriesCourse(entry);
				else await saveRecurringCourse(entry);
				count++;
			}

			applied = count;
			plan = null;
			pasted = '';
		} catch (/** @type {any} */ problem) {
			// Partial writes are not rolled back — each entry is its own document,
			// and what was written is real. Say how far it got rather than implying
			// nothing happened.
			error = problem?.message ?? String(problem);
			applied = count;
		}
	}

	const total = $derived(
		plan ? plan.locations.length + plan.packages.length + plan.courses.length : 0
	);
</script>

<!--
	Folded shut, and last on the page.

	This is a setup step: a studio does it once, on the day it starts, and then
	never again. Standing open it met somebody who came to change one price with a
	paste field and a prompt builder — the loudest thing on the screen belonged to
	the rarest task. `<details>` rather than a toggle in script: it keeps the
	content in the document, so a browser's find-in-page still reaches it and
	nothing has to be re-rendered to open it.
-->
<details class="mt-6 rounded-card border border-border bg-surface" data-testid="import-panel">
	<summary
		class="cursor-pointer list-none p-6 [&::-webkit-details-marker]:hidden"
		data-testid="import-open"
	>
		<span class="font-medium">{m.import_title()}</span>
		<span class="mt-1 block max-w-2xl text-sm text-muted">{m.import_summary()}</span>
	</summary>

	<div class="px-6 pb-6">
		<p class="max-w-2xl text-sm text-muted">{m.import_intro()}</p>

		<h3 class="mt-5 font-medium">{m.import_prompt_heading()}</h3>
		<p class="mt-1 max-w-2xl text-sm text-muted">{m.import_prompt_hint()}</p>

		<div class="mt-3 flex flex-wrap items-end gap-3">
			<label class="grid gap-1 text-sm text-muted">
				{m.import_url_label()}
				<input
					type="url"
					inputmode="url"
					placeholder="https://…"
					data-testid="import-url"
					bind:value={siteUrl}
					class="w-72 max-w-full rounded-control border p-2"
				/>
			</label>
			<button
				type="button"
				data-testid="import-copy-prompt"
				onclick={copyPrompt}
				class="rounded-control border border-border px-4 py-2"
			>
				{m.import_copy_prompt()}
			</button>
		</div>

		{#if promptCopied}
			<p class="mt-2 text-sm text-success" data-testid="import-prompt-copied">
				{m.import_prompt_copied()}
			</p>
		{/if}

		<h3 class="mt-6 font-medium">{m.import_paste_heading()}</h3>
		<label class="mt-2 block text-sm text-muted" for="setup-paste">{m.import_paste_label()}</label>
		<textarea
			id="setup-paste"
			data-testid="import-paste"
			rows="5"
			bind:value={pasted}
			class="mt-1 w-full rounded-control border p-2 font-mono text-xs"></textarea>

		<button
			type="button"
			data-testid="import-review"
			onclick={review}
			class="mt-3 rounded-control border border-border px-4 py-2"
		>
			{m.import_read()}
		</button>

		{#if error}
			<p class="mt-3 text-sm text-danger" role="alert" data-testid="import-error">{error}</p>
		{/if}

		{#if applied > 0}
			<p class="mt-3 text-sm text-success" data-testid="import-applied">
				{m.import_applied({ count: String(applied) })}
			</p>
		{/if}

		{#if plan}
			{#if plan.source}
				<p class="mt-4 text-sm text-faint" data-testid="import-source">
					{m.import_source({ source: plan.source })}
				</p>
			{/if}

			{#if total > 0}
				<h3 class="mt-4 font-medium">{m.import_new_heading()}</h3>
				<p class="mt-1 text-sm text-warning">{m.import_check_prices()}</p>

				<ul class="mt-3 grid gap-2" data-testid="import-new">
					{#each plan.locations as entry (entry.id)}
						<li class="rounded-control border border-border p-3" data-testid="import-row">
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={wanted(`location:${entry.id}`)}
									onchange={() =>
										(skipped[`location:${entry.id}`] = wanted(`location:${entry.id}`))}
								/>
								<span class="text-faint">{m.import_kind_location()}</span>
								<span class="font-medium">{entry.name.de}</span>
							</label>
						</li>
					{/each}

					{#each plan.packages as entry (entry.id)}
						<li class="rounded-control border border-border p-3" data-testid="import-row">
							<label class="flex flex-wrap items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={wanted(`package:${entry.id}`)}
									onchange={() => (skipped[`package:${entry.id}`] = wanted(`package:${entry.id}`))}
								/>
								<span class="text-faint">{m.import_kind_package()}</span>
								<span class="font-medium">{entry.name.de}</span>
							</label>

							<div class="mt-2 flex flex-wrap gap-3">
								<label class="grid gap-1 text-xs text-muted">
									{m.import_price_label()}
									<input
										type="number"
										step="0.01"
										min="0"
										data-testid="import-price"
										bind:value={entry.priceEUR}
										class="w-28 rounded-control border p-1"
									/>
								</label>
								{#if entry.units !== null}
									<label class="grid gap-1 text-xs text-muted">
										{m.import_units_label()}
										<input
											type="number"
											min="1"
											bind:value={entry.units}
											class="w-20 rounded-control border p-1"
										/>
									</label>
								{/if}
								{#if entry.validityDays !== null}
									<label class="grid gap-1 text-xs text-muted">
										{m.import_days_label()}
										<input
											type="number"
											min="1"
											bind:value={entry.validityDays}
											class="w-24 rounded-control border p-1"
										/>
									</label>
								{/if}
							</div>
						</li>
					{/each}

					{#each plan.courses as entry (entry.id)}
						<li class="rounded-control border border-border p-3" data-testid="import-row">
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={wanted(`course:${entry.id}`)}
									onchange={() => (skipped[`course:${entry.id}`] = wanted(`course:${entry.id}`))}
								/>
								<span class="text-faint">{m.import_kind_course()}</span>
								<span class="font-medium">{entry.title.de}</span>
								<span class="text-faint">{entry.time}</span>
							</label>

							<div class="mt-2 flex flex-wrap items-end gap-3">
								<label class="grid gap-1 text-xs text-muted">
									{m.import_capacity_label()}
									<input
										type="number"
										min="1"
										data-testid="import-capacity"
										bind:value={entry.capacity}
										class="w-20 rounded-control border p-1"
									/>
								</label>
								{#if entry.capacityAssumed}
									<!-- A website publishes its timetable, not its room size. Saying
								     so beats presenting a number nobody read as if it came from
								     the page. -->
									<span class="pb-1 text-xs text-warning" data-testid="import-capacity-assumed">
										{m.import_capacity_assumed()}
									</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>

				<button
					type="button"
					data-testid="import-apply"
					onclick={apply}
					class="mt-4 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
				>
					{m.import_apply()}
				</button>
			{:else}
				<p class="mt-4 text-sm text-muted" data-testid="import-nothing">{m.import_nothing()}</p>
			{/if}

			{#if plan.existing.length}
				<h3 class="mt-6 font-medium">{m.import_existing_heading()}</h3>
				<ul class="mt-2 grid gap-1 text-sm text-muted" data-testid="import-existing">
					{#each plan.existing as entry (entry.kind + entry.id)}
						<li>{entry.name}</li>
					{/each}
				</ul>
			{/if}

			{#if plan.refused.length}
				<!--
				Shown as prominently as what worked. A studio that pasted its whole
				price list needs to see which lines did not arrive, or it will believe
				the import was complete.
			-->
				<h3 class="mt-6 font-medium">{m.import_refused_heading()}</h3>
				<ul class="mt-2 grid gap-1 text-sm" data-testid="import-refused">
					{#each plan.refused as refusal, index (index)}
						<li><span class="font-medium">{refusal.what}</span> — {refusal.reason}</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</details>
