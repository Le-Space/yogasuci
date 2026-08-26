<script>
	/**
	 * Bookings, from both sides of the counter (docs/PLAN.md §3.3).
	 *
	 * A student sees their own requests and what became of them. A studio device
	 * sees the requests of every student whose database it has been handed, and
	 * decides. The two lists come from different databases — that separation is
	 * the whole point of the per-student cut, and it is why a student can never
	 * see a classmate here.
	 */
	import StudioGate from '$lib/components/StudioGate.svelte';
	import {
		bookingsStore,
		cancelBooking,
		decideBooking,
		studentBookingsStore
	} from '$lib/db/bookings.js';
	import { canEditStore } from '$lib/db/join.js';
	import { findConflicts } from '$lib/db/conflicts.js';
	import { foldLedger } from '$lib/db/ledger-view.js';
	import { ticketEventsStore } from '$lib/db/tickets.js';
	import { coursesStore, localized } from '$lib/db/program.js';
	import { bookingEndsOn, isPastBooking } from '$lib/program/booking-time.js';
	import { hasFreePlace, syncOccupancy } from '$lib/db/occupancy.js';
	import { studentBookingsStore as allStudentBookings } from '$lib/db/bookings.js';
	import { devicesStore } from '$lib/db/registry.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let error = $state('');

	/**
	 * Contradictions between this device's own bookings and its own ledger.
	 *
	 * Shown to the student rather than only at the counter, because they are the
	 * one who can explain it — and because a cancellation that the studio has
	 * already checked in is a bill they may not be expecting. Nothing is resolved
	 * automatically; see src/lib/db/conflicts.js for why.
	 */
	let conflicts = $state(/** @type {import('$lib/db/conflicts.js').Conflict[]} */ ([]));

	$effect(() => {
		const bookings = $bookingsStore;
		const events = $ticketEventsStore;
		void $devicesStore;

		let cancelled = false;
		(async () => {
			const ledger = await foldLedger(events);
			if (cancelled) return;
			conflicts = findConflicts(bookings, ledger);
		})();

		return () => {
			cancelled = true;
		};
	});

	let isStudioDevice = $derived($canEditStore);

	/** @type {Record<string, () => string>} */
	const STATUS_LABEL = {
		requested: () => m.booking_status_requested(),
		confirmed: () => m.booking_status_confirmed(),
		declined: () => m.booking_status_declined(),
		cancelled: () => m.booking_status_cancelled()
	};

	/** @type {Record<string, string>} */
	const STATUS_TONE = {
		requested: 'text-warning',
		confirmed: 'text-success',
		declined: 'text-faint',
		cancelled: 'text-faint'
	};

	/** @param {() => Promise<void>} action */
	async function run(action) {
		error = '';
		try {
			await action();
		} catch (/** @type {any} */ cause) {
			error = cause?.message ?? String(cause);
		}
	}

	/** @param {string} courseId */
	function courseTitle(courseId) {
		const course = $coursesStore.find((entry) => entry._id === courseId);
		return course ? localized(course.title, getLocale()) : courseId;
	}

	/**
	 * Past or coming up.
	 *
	 * A booking list grows in one direction only, and after a season the thing
	 * somebody actually came for — "what have I got next week" — is at the bottom
	 * under everything they have already attended. So the two are separated, and
	 * the one you are more likely to want is the one that opens.
	 *
	 * The decision itself is in `$lib/program/booking-time.js`, tested there: a
	 * class today counts as coming up, and a booking whose end cannot be
	 * established stays under "coming up" rather than disappearing into the past.
	 */
	const TABS = /** @type {const} */ (['upcoming', 'past']);
	const TAB_LABEL = { upcoming: m.bookings_upcoming, past: m.bookings_past };
	let tab = $state('upcoming');

	/** @param {string} courseId */
	function courseOf(courseId) {
		return $coursesStore.find((entry) => entry._id === courseId) ?? null;
	}

	/**
	 * `9999` rather than dropping them: a booking for a whole series has no single
	 * date, and it belongs after the classes that do — those are the ones with
	 * somewhere to be.
	 *
	 * @param {any} booking
	 */
	function sortKey(booking) {
		return bookingEndsOn(booking, courseOf(booking.courseId)) ?? '9999-99-99';
	}

	let today = $derived(new Date().toISOString().slice(0, 10));

	let upcoming = $derived(
		$bookingsStore
			.filter((booking) => !isPastBooking(booking, courseOf(booking.courseId), today))
			.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
	);

	/** Newest first: the class you just came from is the one you might question. */
	let past = $derived(
		$bookingsStore
			.filter((booking) => isPastBooking(booking, courseOf(booking.courseId), today))
			.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
	);

	/** Every request from every student this device has seen, newest first. */
	let incoming = $derived(
		[...$studentBookingsStore.values()]
			.flatMap((student) =>
				student.bookings.map((booking) => ({ ...booking, db: student.db, from: student.did }))
			)
			.filter((booking) => booking.status === 'requested')
			.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))
	);

	/**
	 * @param {any} booking
	 * @param {'confirmed' | 'declined'} status
	 */
	async function decide(booking, status) {
		const own = $ownDidStore;
		const device = $devicesStore.find((entry) => entry.deviceDid === own);
		const course = $coursesStore.find((entry) => entry._id === booking.courseId);

		// Capacity is checked here and nowhere earlier: a request is a wish, and
		// this device is the only one that can see how many places are actually
		// taken (docs/PLAN.md §3.3.1).
		if (
			status === 'confirmed' &&
			course &&
			!hasFreePlace({
				courseId: booking.courseId,
				date: booking.date ?? null,
				capacity: Number(course.capacity)
			})
		) {
			error = m.booking_full_refused();
			return;
		}

		await run(() =>
			decideBooking({
				db: booking.db,
				bookingId: booking._id,
				status,
				decidedBy: {
					deviceDid: own ?? '',
					// The owner's own device may not be in the registry as a device;
					// the booking's location is the honest fallback.
					locationId: device?.locationId ?? booking.locationId
				}
			})
		);

		await run(async () => {
			await syncOccupancy(own ?? '');
		});
	}

	// Republish whenever a student's bookings change here — a cancellation frees
	// a place just as much as a confirmation takes one, and it arrives by
	// replication rather than through a button on this screen.
	$effect(() => {
		void $allStudentBookings;
		if (!isStudioDevice) return;
		syncOccupancy($ownDidStore ?? '').catch(() => {});
	});
</script>

<h1 class="text-3xl font-bold">{m.bookings_title()}</h1>

<StudioGate>
	{#if error}
		<p class="mt-4 text-danger" role="alert" data-testid="bookings-error">
			{m.error_generic({ reason: error })}
		</p>
	{/if}

	{#if isStudioDevice}
		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			<h2 class="eyebrow">{m.bookings_incoming()}</h2>

			<ul class="mt-3 grid gap-2" data-testid="incoming-list">
				{#each incoming as booking (booking._id)}
					<li
						class="flex flex-wrap items-baseline gap-3 border-b border-border pb-2"
						data-testid="incoming-booking"
						data-booking-id={booking._id}
						data-from={booking.from}
					>
						<span class="flex-1">
							{courseTitle(booking.courseId)}
							<span class="text-faint">
								· {booking.date ?? m.booking_series_whole()}
								· {booking.from.slice(-8)}
							</span>
						</span>
						<button
							type="button"
							data-testid="booking-confirm"
							onclick={() => decide(booking, 'confirmed')}
							class="rounded-control bg-accent px-3 py-1 text-sm font-medium text-accent-contrast"
						>
							{m.booking_confirm()}
						</button>
						<button
							type="button"
							data-testid="booking-decline"
							onclick={() => decide(booking, 'declined')}
							class="rounded-control border border-border px-3 py-1 text-sm"
						>
							{m.booking_decline()}
						</button>
					</li>
				{:else}
					<li class="text-faint" data-testid="incoming-empty">{m.bookings_incoming_none()}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if conflicts.length > 0}
		<section
			class="mt-6 rounded-card border border-warning bg-surface p-6"
			data-testid="conflict-list"
			role="alert"
		>
			<h2 class="eyebrow text-warning">{m.conflict_title()}</h2>
			<p class="mt-1 text-sm text-muted">{m.conflict_body()}</p>
			<ul class="mt-3 grid gap-2 text-sm">
				{#each conflicts as conflict (conflict.bookingId)}
					<li data-testid="conflict" data-kind={conflict.kind} data-booking-id={conflict.bookingId}>
						{m.conflict_cancelled_after_redeem({
							course: localized(
								$coursesStore.find((course) => course._id === conflict.courseId)?.title,
								getLocale()
							),
							date: conflict.date
						})}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.bookings_mine()}</h2>

		<!--
			Both panels stay in the document with `hidden` on the inactive one rather
			than being swapped with an {#if}, for the reason the programme tabs give:
			`aria-controls` has to point at an element that exists, or axe fails the
			page on an invalid reference.
		-->
		<div class="mt-3 flex gap-1 border-b border-border" role="tablist" data-testid="bookings-tabs">
			{#each TABS as name (name)}
				<button
					type="button"
					role="tab"
					id="booking-tab-{name}"
					aria-selected={tab === name}
					aria-controls="booking-panel-{name}"
					data-testid="tab-{name}"
					onclick={() => (tab = name)}
					class="rounded-t-control px-4 py-2 text-sm font-medium {tab === name
						? 'border-b-2 border-accent text-text'
						: 'text-muted'}"
				>
					{TAB_LABEL[name]()}
				</button>
			{/each}
		</div>

		<div
			id="booking-panel-upcoming"
			role="tabpanel"
			aria-labelledby="booking-tab-upcoming"
			hidden={tab !== 'upcoming'}
		>
			<ul class="mt-3 grid gap-2" data-testid="my-bookings">
				{#each upcoming as booking (booking._id)}
					<li
						class="flex flex-wrap items-baseline gap-3 border-b border-border pb-2"
						data-testid="my-booking"
						data-booking-id={booking._id}
						data-status={booking.status}
						data-course-id={booking.courseId}
						data-date={booking.date ?? ''}
					>
						<span class="flex-1">
							{courseTitle(booking.courseId)}
							<span class="text-faint">· {booking.date ?? m.booking_series_whole()}</span>
						</span>

						<span class={STATUS_TONE[booking.status]} data-testid="my-booking-status">
							{STATUS_LABEL[booking.status]()}
						</span>

						<!--
							"Requested" is a local fact until the studio has seen it. Saying so
							is the whole difference between this and a server-backed app, where
							a request either reached the server or visibly failed.
						-->
						{#if booking.status === 'requested'}
							<span class="w-full text-xs text-faint" data-testid="my-booking-pending">
								{m.booking_local_only()}
							</span>
						{/if}

						{#if booking.status === 'requested' || booking.status === 'confirmed'}
							<button
								type="button"
								data-testid="booking-cancel"
								onclick={() => run(() => cancelBooking(booking._id))}
								class="rounded-control border border-border px-3 py-1 text-sm"
							>
								{m.booking_cancel()}
							</button>
						{/if}
					</li>
				{:else}
					<li class="text-faint" data-testid="my-bookings-empty">{m.bookings_upcoming_none()}</li>
				{/each}
			</ul>
		</div>

		<div
			id="booking-panel-past"
			role="tabpanel"
			aria-labelledby="booking-tab-past"
			hidden={tab !== 'past'}
		>
			<ul class="mt-3 grid gap-2" data-testid="my-bookings-past">
				{#each past as booking (booking._id)}
					<li
						class="flex flex-wrap items-baseline gap-3 border-b border-border pb-2"
						data-testid="my-booking"
						data-booking-id={booking._id}
						data-status={booking.status}
						data-course-id={booking.courseId}
						data-date={booking.date ?? ''}
					>
						<span class="flex-1">
							{courseTitle(booking.courseId)}
							<span class="text-faint">· {booking.date ?? m.booking_series_whole()}</span>
						</span>

						<span class={STATUS_TONE[booking.status]} data-testid="my-booking-status">
							{STATUS_LABEL[booking.status]()}
						</span>

						<!--
							"Requested" is a local fact until the studio has seen it. Saying so
							is the whole difference between this and a server-backed app, where
							a request either reached the server or visibly failed.
						-->
						{#if booking.status === 'requested'}
							<span class="w-full text-xs text-faint" data-testid="my-booking-pending">
								{m.booking_local_only()}
							</span>
						{/if}

						{#if booking.status === 'requested' || booking.status === 'confirmed'}
							<button
								type="button"
								data-testid="booking-cancel"
								onclick={() => run(() => cancelBooking(booking._id))}
								class="rounded-control border border-border px-3 py-1 text-sm"
							>
								{m.booking_cancel()}
							</button>
						{/if}
					</li>
				{:else}
					<li class="text-faint" data-testid="my-bookings-past-empty">{m.bookings_past_none()}</li>
				{/each}
			</ul>
		</div>
	</section>
</StudioGate>
