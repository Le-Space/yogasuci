<script>
	/**
	 * Programme editor: courses and packages (docs/PLAN.md §3.2).
	 *
	 * The series generator is the part worth reading. It only *proposes* dates —
	 * the owner strikes holidays out of the list, and what is left is saved as
	 * the course. That is why the sessions are stored concretely and the
	 * validity window is derived from them rather than typed in.
	 */
	import SetupImport from '$lib/components/SetupImport.svelte';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import { locationsStore } from '$lib/db/registry.js';
	import {
		coursesStore,
		courseWindow,
		occupancyStore,
		deactivateCourse,
		deactivatePackage,
		localized,
		packagesStore,
		savePackage,
		saveRecurringCourse,
		saveSeriesCourse
	} from '$lib/db/program.js';
	import { generateSessions } from '$lib/program/sessions.js';
	import { canEditProgram } from '$lib/db/join.js';
	import { nextOccurrence } from '$lib/program/sessions.js';
	import { requestBooking } from '$lib/db/bookings.js';
	import { readOccupancy } from '$lib/db/occupancy.js';
	import { devicesStore, studioStore } from '$lib/db/registry.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	const WEEKDAYS = [
		{ value: 1, label: () => m.weekday_1() },
		{ value: 2, label: () => m.weekday_2() },
		{ value: 3, label: () => m.weekday_3() },
		{ value: 4, label: () => m.weekday_4() },
		{ value: 5, label: () => m.weekday_5() },
		{ value: 6, label: () => m.weekday_6() },
		{ value: 0, label: () => m.weekday_0() }
	];

	const PACKAGE_KINDS = [
		{ value: 'single', label: () => m.package_kind_single() },
		{ value: 'week', label: () => m.package_kind_week() },
		{ value: 'ten', label: () => m.package_kind_ten() },
		{ value: 'month', label: () => m.package_kind_month() },
		{ value: 'year', label: () => m.package_kind_year() }
	];

	let error = $state('');

	// The owner, or a device the owner approved. Everyone else replicates the
	// programme read-only: the ACL refuses their writes, and hiding the forms is
	// honesty about that rather than the enforcement.
	//
	// Reads $devicesStore so an approval — or a revocation — arriving by
	// replication changes what this device offers, without a reload.
	let canEdit = $derived(Boolean($studioStore) && Boolean($devicesStore) && canEditProgram());

	let course = $state({
		id: '',
		mode: 'recurring',
		locationId: '',
		titleDe: '',
		titleEn: '',
		weekday: 3,
		time: '18:00',
		durationMin: 75,
		capacity: 12,
		validFrom: '',
		validUntil: '',
		priceEUR: 95,
		allowDropIn: true
	});

	let series = $state({ startDate: '', weeks: 5, weekdays: /** @type {number[]} */ ([2, 4]) });
	let sessions = $state(/** @type {{ date: string }[]} */ ([]));

	let pkg = $state({
		id: '',
		nameDe: '',
		nameEn: '',
		kind: 'ten',
		priceEUR: 120,
		units: '10',
		validityDays: 180,
		validityStart: 'issue'
	});

	/** @param {() => Promise<void>} action */
	async function run(action) {
		error = '';
		try {
			await action();
		} catch (/** @type {any} */ cause) {
			error = cause?.message ?? String(cause);
		}
	}

	function toggleWeekday(/** @type {number} */ value) {
		series.weekdays = series.weekdays.includes(value)
			? series.weekdays.filter((day) => day !== value)
			: [...series.weekdays, value].sort();
	}

	function propose() {
		sessions = generateSessions({
			startDate: series.startDate,
			weekdays: /** @type {any} */ (series.weekdays),
			weeks: Number(series.weeks)
		});
	}

	function dropSession(/** @type {string} */ date) {
		// Dropped, not replaced: cancelling for a holiday shortens the course
		// rather than pushing it into another week.
		sessions = sessions.filter((session) => session.date !== date);
	}

	/**
	 * Free places for a course, as published by the studio.
	 *
	 * `null` means nobody has published a count yet — which is the truth on a
	 * device that has just joined, and better said than guessed.
	 *
	 * @param {any} course
	 */
	function places(course) {
		const date = course.mode === 'series' ? null : nextOccurrence(course, today);
		return readOccupancy($occupancyStore, course._id, date);
	}

	const today = new Date().toISOString().slice(0, 10);

	/**
	 * Book a course.
	 *
	 * A series is booked as a whole — one booking covers every session, and the
	 * date stays null (docs/PLAN.md §3.2). An open weekly class is booked for its
	 * next occurrence, which is the only date a student could mean.
	 *
	 * @param {any} course
	 */
	async function book(course) {
		await run(async () => {
			const date =
				course.mode === 'series'
					? null
					: nextOccurrence(course, new Date().toISOString().slice(0, 10));

			await requestBooking({
				courseId: course._id,
				date,
				locationId: course.locationId
			});
		});
	}

	async function submitCourse(/** @type {SubmitEvent} */ event) {
		event.preventDefault();

		await run(async () => {
			const title = { de: course.titleDe, en: course.titleEn || course.titleDe };

			if (course.mode === 'series') {
				if (sessions.length === 0) throw new Error('A series needs at least one session.');

				await saveSeriesCourse({
					id: course.id,
					locationId: course.locationId,
					title,
					time: course.time,
					durationMin: Number(course.durationMin),
					capacity: Number(course.capacity),
					sessions,
					priceEUR: Number(course.priceEUR),
					allowDropIn: course.allowDropIn
				});
			} else {
				await saveRecurringCourse({
					id: course.id,
					locationId: course.locationId,
					title,
					weekday: Number(course.weekday),
					time: course.time,
					durationMin: Number(course.durationMin),
					capacity: Number(course.capacity),
					validFrom: course.validFrom || null,
					validUntil: course.validUntil || null
				});
			}

			course = { ...course, id: '', titleDe: '', titleEn: '' };
			sessions = [];
		});
	}

	async function submitPackage(/** @type {SubmitEvent} */ event) {
		event.preventDefault();

		await run(async () => {
			await savePackage({
				id: pkg.id,
				name: { de: pkg.nameDe, en: pkg.nameEn || pkg.nameDe },
				kind: /** @type {any} */ (pkg.kind),
				priceEUR: Number(pkg.priceEUR),
				// An empty units field means a time pass: attendance is logged but
				// nothing is deducted.
				units: pkg.units === '' ? null : Number(pkg.units),
				validityDays: Number(pkg.validityDays),
				validityStart: /** @type {any} */ (pkg.validityStart)
			});

			pkg = { ...pkg, id: '', nameDe: '', nameEn: '' };
		});
	}

	/**
	 * The location's name rather than its id.
	 *
	 * A course list that says `location:altstadt` is fine for whoever typed it and
	 * useless to a student deciding which side of town to cycle to. The name lives
	 * in the registry and the id on the course, so this is also the first place a
	 * student can see that the registry reached them at all.
	 *
	 * Falls back to the id: better a raw string than an empty gap while the registry
	 * is still on its way.
	 *
	 * @param {string} locationId
	 */
	function locationName(locationId) {
		const location = $locationsStore.find((entry) => entry._id === locationId);
		return location ? localized(location.name, getLocale()) : locationId;
	}
</script>

<h1 class="text-3xl font-bold">{m.program_title()}</h1>

<StudioGate>
	{#if error}
		<p class="mt-4 text-danger" role="alert" data-testid="program-error">
			{m.error_generic({ reason: error })}
		</p>
	{/if}

	{#if !canEdit}
		<p class="mt-4 text-sm text-muted" data-testid="guest-notice">{m.guest_readonly()}</p>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.courses_title()}</h2>

		<ul class="mt-3 grid gap-2" data-testid="course-list">
			{#each $coursesStore as entry (entry._id)}
				{@const window = courseWindow(entry)}
				{@const free = places(entry)}
				<li
					class="flex flex-wrap items-baseline gap-3 border-b border-border pb-2"
					data-testid="course-item"
					data-course-id={entry._id}
					data-mode={entry.mode}
					data-sessions={entry.sessions?.length ?? 0}
					data-active={entry.active}
					data-free={free ? Math.max(0, free.capacity - free.confirmed) : ''}
					data-location-id={entry.locationId}
				>
					<span class="flex-1">
						{localized(entry.title, getLocale())}
						<span class="text-faint">
							· {locationName(entry.locationId)}
							{#if entry.mode === 'series'}
								· {m.series_session_count({ count: entry.sessions?.length ?? 0 })}
								· {window.from} – {window.until}
							{:else}
								· {WEEKDAYS.find((day) => day.value === entry.weekday)?.label()}
								· {entry.time}
							{/if}
						</span>
					</span>
					<!--
						Published by the studio, because a student device holds only its
						own booking and cannot count a class itself (docs/PLAN.md §3.3.1).
						Saying "unknown" is honest on a device that has not yet seen a
						count; guessing zero would not be.
					-->
					<span class="text-sm text-faint" data-testid="course-occupancy">
						{#if !free}
							{m.occupancy_unknown()}
						{:else if free.capacity - free.confirmed <= 0}
							<span class="text-warning">{m.occupancy_full()}</span>
						{:else}
							{m.occupancy_free({
								free: free.capacity - free.confirmed,
								capacity: free.capacity
							})}
						{/if}
					</span>

					{#if entry.active}
						<button
							type="button"
							data-testid="course-book"
							onclick={() => book(entry)}
							class="rounded-control bg-accent px-3 py-1 text-sm font-medium text-accent-contrast"
						>
							{m.booking_book()}
						</button>
					{/if}
					{#if entry.active && canEdit}
						<button
							type="button"
							data-testid="course-deactivate"
							onclick={() => run(() => deactivateCourse(entry._id))}
							class="rounded-control border border-border px-2 py-1 text-sm"
						>
							{m.course_deactivate()}
						</button>
					{/if}
				</li>
			{:else}
				<li class="text-faint" data-testid="course-empty">{m.course_none()}</li>
			{/each}
		</ul>

		{#if canEdit}
			<form class="mt-4 grid max-w-lg gap-3" onsubmit={submitCourse}>
				<label class="grid gap-1 text-sm">
					{m.course_mode()}
					<select
						data-testid="course-mode"
						bind:value={course.mode}
						class="rounded-control border p-2"
					>
						<option value="recurring">{m.course_mode_recurring()}</option>
						<option value="series">{m.course_mode_series()}</option>
					</select>
				</label>

				<label class="grid gap-1 text-sm">
					{m.course_id()}
					<input
						data-testid="course-id"
						bind:value={course.id}
						required
						pattern="[a-z0-9\-]+"
						class="rounded-control border p-2"
					/>
				</label>

				<label class="grid gap-1 text-sm">
					{m.course_location()}
					<select
						data-testid="course-location"
						bind:value={course.locationId}
						required
						class="rounded-control border p-2"
					>
						<option value="" disabled></option>
						{#each $locationsStore.filter((entry) => entry.active) as entry (entry._id)}
							<option value={entry._id}>{localized(entry.name, getLocale())}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-1 text-sm">
					{m.course_title_de()}
					<input
						data-testid="course-title-de"
						bind:value={course.titleDe}
						required
						class="rounded-control border p-2"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					{m.course_title_en()}
					<input
						data-testid="course-title-en"
						bind:value={course.titleEn}
						class="rounded-control border p-2"
					/>
				</label>

				<div class="grid grid-cols-2 gap-3">
					<label class="grid gap-1 text-sm">
						{m.course_time()}
						<input
							type="time"
							data-testid="course-time"
							bind:value={course.time}
							class="rounded-control border p-2"
						/>
					</label>
					<label class="grid gap-1 text-sm">
						{m.course_duration()}
						<input
							type="number"
							min="15"
							data-testid="course-duration"
							bind:value={course.durationMin}
							class="rounded-control border p-2"
						/>
					</label>
					<label class="grid gap-1 text-sm">
						{m.course_capacity()}
						<input
							type="number"
							min="1"
							data-testid="course-capacity"
							bind:value={course.capacity}
							class="rounded-control border p-2"
						/>
					</label>

					{#if course.mode === 'recurring'}
						<label class="grid gap-1 text-sm">
							{m.course_weekday()}
							<select
								data-testid="course-weekday"
								bind:value={course.weekday}
								class="rounded-control border p-2"
							>
								{#each WEEKDAYS as day (day.value)}
									<option value={day.value}>{day.label()}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1 text-sm">
							{m.course_valid_from()}
							<input
								type="date"
								data-testid="course-valid-from"
								bind:value={course.validFrom}
								class="rounded-control border p-2"
							/>
						</label>
						<label class="grid gap-1 text-sm">
							{m.course_valid_until()}
							<input
								type="date"
								data-testid="course-valid-until"
								bind:value={course.validUntil}
								class="rounded-control border p-2"
							/>
						</label>
					{:else}
						<label class="grid gap-1 text-sm">
							{m.course_price()}
							<input
								type="number"
								step="0.01"
								min="0"
								data-testid="course-price"
								bind:value={course.priceEUR}
								class="rounded-control border p-2"
							/>
						</label>
					{/if}
				</div>

				{#if course.mode === 'series'}
					<fieldset class="grid gap-3 rounded-control border border-border p-3">
						<legend class="px-1 text-sm text-muted">{m.series_sessions()}</legend>

						<div class="grid grid-cols-2 gap-3">
							<label class="grid gap-1 text-sm">
								{m.series_start()}
								<input
									type="date"
									data-testid="series-start"
									bind:value={series.startDate}
									class="rounded-control border p-2"
								/>
							</label>
							<label class="grid gap-1 text-sm">
								{m.series_weeks()}
								<input
									type="number"
									min="1"
									data-testid="series-weeks"
									bind:value={series.weeks}
									class="rounded-control border p-2"
								/>
							</label>
						</div>

						<div class="grid gap-1 text-sm">
							<span>{m.series_weekdays()}</span>
							<div class="flex flex-wrap gap-2">
								{#each WEEKDAYS as day (day.value)}
									<button
										type="button"
										data-testid={`series-weekday-${day.value}`}
										aria-pressed={series.weekdays.includes(day.value)}
										onclick={() => toggleWeekday(day.value)}
										class="rounded-control border border-border px-2 py-1 text-sm
										{series.weekdays.includes(day.value) ? 'bg-surface-raised text-text' : 'text-faint'}"
									>
										{day.label()}
									</button>
								{/each}
							</div>
						</div>

						<button
							type="button"
							data-testid="series-generate"
							onclick={propose}
							class="justify-self-start rounded-control border border-border px-3 py-1.5 text-sm"
						>
							{m.series_generate()}
						</button>

						<ul class="grid gap-1" data-testid="series-session-list">
							{#each sessions as session (session.date)}
								<li class="flex items-baseline gap-3 text-sm" data-testid="series-session">
									<span class="flex-1 font-mono">{session.date}</span>
									<button
										type="button"
										data-testid={`series-drop-${session.date}`}
										onclick={() => dropSession(session.date)}
										class="rounded-control border border-border px-2 py-0.5"
									>
										{m.series_drop_session()}
									</button>
								</li>
							{/each}
						</ul>

						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								data-testid="course-allow-dropin"
								bind:checked={course.allowDropIn}
							/>
							{m.course_allow_dropin()}
						</label>
					</fieldset>
				{/if}

				<button
					type="submit"
					data-testid="course-add"
					class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
				>
					{m.course_add()}
				</button>
			</form>
		{/if}
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.packages_title()}</h2>

		<ul class="mt-3 grid gap-2" data-testid="package-list">
			{#each $packagesStore as entry (entry._id)}
				<li
					class="flex items-baseline gap-3 border-b border-border pb-2"
					data-testid="package-item"
					data-package-id={entry._id}
					data-active={entry.active !== false}
				>
					<span class="flex-1">
						{localized(entry.name, getLocale())}
						<span class="text-faint">
							· {entry.priceEUR} EUR · {entry.units === null ? m.ticket_unlimited() : entry.units}
						</span>
						{#if entry.active === false}
							<span class="text-warning">· {m.package_inactive()}</span>
						{/if}
					</span>

					{#if entry.active !== false && canEdit}
						<button
							type="button"
							data-testid="package-deactivate"
							onclick={() => run(() => deactivatePackage(entry._id))}
							class="rounded-control border border-border px-2 py-1 text-sm"
						>
							{m.package_deactivate()}
						</button>
					{/if}
				</li>
			{:else}
				<li class="text-faint" data-testid="package-empty">{m.package_none()}</li>
			{/each}
		</ul>

		{#if canEdit}
			<form class="mt-4 grid max-w-lg gap-3" onsubmit={submitPackage}>
				<label class="grid gap-1 text-sm">
					{m.package_id()}
					<input
						data-testid="package-id"
						bind:value={pkg.id}
						required
						pattern="[a-z0-9\-]+"
						class="rounded-control border p-2"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					{m.package_name_de()}
					<input
						data-testid="package-name-de"
						bind:value={pkg.nameDe}
						required
						class="rounded-control border p-2"
					/>
				</label>
				<label class="grid gap-1 text-sm">
					{m.package_name_en()}
					<input
						data-testid="package-name-en"
						bind:value={pkg.nameEn}
						class="rounded-control border p-2"
					/>
				</label>

				<div class="grid grid-cols-2 gap-3">
					<label class="grid gap-1 text-sm">
						{m.package_kind()}
						<select
							data-testid="package-kind"
							bind:value={pkg.kind}
							class="rounded-control border p-2"
						>
							{#each PACKAGE_KINDS as kind (kind.value)}
								<option value={kind.value}>{kind.label()}</option>
							{/each}
						</select>
					</label>
					<label class="grid gap-1 text-sm">
						{m.package_price()}
						<input
							type="number"
							step="0.01"
							min="0"
							data-testid="package-price"
							bind:value={pkg.priceEUR}
							class="rounded-control border p-2"
						/>
					</label>
					<label class="grid gap-1 text-sm">
						{m.package_units()}
						<input
							type="number"
							min="1"
							data-testid="package-units"
							bind:value={pkg.units}
							class="rounded-control border p-2"
						/>
					</label>
					<label class="grid gap-1 text-sm">
						{m.package_validity_days()}
						<input
							type="number"
							min="1"
							data-testid="package-validity-days"
							bind:value={pkg.validityDays}
							class="rounded-control border p-2"
						/>
					</label>
					<label class="grid gap-1 text-sm">
						{m.package_validity_start()}
						<select
							data-testid="package-validity-start"
							bind:value={pkg.validityStart}
							class="rounded-control border p-2"
						>
							<option value="issue">{m.package_validity_issue()}</option>
							<option value="firstRedeem">{m.package_validity_first()}</option>
						</select>
					</label>
				</div>

				<button
					type="submit"
					data-testid="package-add"
					class="justify-self-start rounded-control border border-border px-4 py-2"
				>
					{m.package_add()}
				</button>
			</form>
		{/if}
	</section>

	<!--
		Last on the page on purpose: somebody arriving here to change one price
		should not meet a paste field first. An import is a setup step, and setup
		happens once.
	-->
	<SetupImport />
</StudioGate>
