<script>
	import '$lib/styles/tokens.css';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import OmMark from '$lib/components/OmMark.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { buildStamp } from '$lib/build-info.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { canEditProgram } from '$lib/db/join.js';
	import { devicesStore, studioStore } from '$lib/db/registry.js';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Route ids, resolved at the href. resolve() rather than a literal path is
	// what keeps the app working when it is served from a subpath — which is
	// exactly how it gets installed from an IPFS gateway.
	//
	// `counter: true` marks the screens that belong behind the desk. They used to
	// be shown to everybody, so a student had eight entries of which four led to a
	// heading and an empty page: the till, check-in, the registry and the cash
	// report all render nothing without a studio role. Four dead ends out of eight
	// is not a navigation, it is a guess about who you are.
	//
	// Not two separate apps, though, and that is deliberate. A studio device is
	// also somebody's device — the owner books classes herself, which is why
	// /bookings shows "mine" and "incoming" on one screen. Splitting the app in two
	// would make her switch between them for two things she does in the same
	// minute. So one app, and a navigation that shows what this device can do.
	const NAV = /** @type {const} */ ([
		{ path: '/program', testid: 'nav-program', label: () => m.nav_program() },
		{ path: '/bookings', testid: 'nav-bookings', label: () => m.nav_bookings() },
		{ path: '/tickets', testid: 'nav-tickets', label: () => m.nav_tickets() },
		{ path: '/till', testid: 'nav-till', label: () => m.till_title(), counter: true },
		{ path: '/checkin', testid: 'nav-checkin', label: () => m.checkin_title(), counter: true },
		{ path: '/studio', testid: 'nav-studio', label: () => m.nav_registry(), counter: true },
		{ path: '/report', testid: 'nav-report', label: () => m.nav_report(), counter: true },
		{ path: '/connect', testid: 'nav-connect', label: () => m.nav_connect() }
	]);

	// Reading both stores is what makes this re-run: `canEditProgram()` reaches into
	// them without subscribing, so on its own it would answer once and never again —
	// and a device approved a minute ago would keep the student's navigation until
	// the next reload.
	let isCounter = $derived(Boolean($studioStore) && Boolean($devicesStore) && canEditProgram());

	let visible = $derived(NAV.filter((item) => !('counter' in item) || isCounter));
</script>

<div class="min-h-screen bg-bg text-text">
	<header class="border-b border-border bg-surface">
		<!--
			`flex-wrap`, and `min-w-0` on the nav below, because without them this header
			made the whole page wider than the screen: measured at 941 px of document on
			a 375 px phone, and still overflowing at 768 px. A flex item does not shrink
			below its content by default, so eight navigation entries simply pushed the
			document sideways and every screen scrolled horizontally.

			Wrapping rather than a hamburger: the entries are the app, a counter device
			gains four of them the moment it is approved, and hiding them behind a menu
			would trade a visible problem for an invisible one. The header grows a row
			instead of the page growing a scrollbar.
		-->
		<div class="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
			<a
				href={resolve('/')}
				class="flex items-center gap-2 font-mono font-bold text-text no-underline"
				data-testid="app-name"
			>
				<OmMark size={26} />
				{m.app_name()}
			</a>

			<!--
				A row of its own below `sm`, sharing the line above it. Wrapping alone was
				not enough: squeezed in beside the name and the controls the nav collapsed
				to 46 px, so every entry took its own line and the header grew to 392 px on
				a phone — taller than half the screen. Given the full width it wraps into
				two or three sensible rows instead.
			-->
			<nav
				class="flex w-full min-w-0 flex-wrap gap-1 sm:w-auto sm:flex-1"
				aria-label={m.nav_program()}
			>
				{#each visible as item (item.path)}
					<a
						href={resolve(item.path)}
						data-testid={item.testid}
						class="rounded-control px-3 py-1.5 text-sm text-muted no-underline transition hover:bg-surface-raised hover:text-text"
					>
						{item.label()}
					</a>
				{/each}
			</nav>

			<!--
				An external link, and one of the few things this app has instead of a
				provider: anybody can read what it does with their studio's data. The
				icon carries an accessible name rather than being decorative — it is a
				link, and a link with no name is a link a screen reader cannot announce.

				`rel="noreferrer"` as well as `noopener`: no reason to tell GitHub which
				studio screen somebody was on when they clicked.
			-->
			<a
				href="https://github.com/Le-Space/yogasuci"
				target="_blank"
				rel="noopener noreferrer"
				data-testid="nav-source"
				title={m.nav_source()}
				aria-label={m.nav_source()}
				class="rounded-control p-1.5 text-muted transition hover:bg-surface-raised hover:text-text"
			>
				<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
					/>
				</svg>
			</a>

			<LanguageSwitch />
			<ThemeToggle />
		</div>
	</header>

	<SyncStatus />

	<main class="mx-auto max-w-4xl px-4 py-8">
		{@render children?.()}
	</main>

	<!--
		In the footer rather than the navigation, and outside StudioGate: a legal
		notice has to be reachable before anybody creates a passkey, and by somebody
		who never will. It is also required to be reachable from every page, which a
		footer does and a start-page link does not.
	-->
	<footer class="border-t border-border">
		<div
			class="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-6 text-sm text-muted"
		>
			<a href={resolve('/legal')} data-testid="nav-legal" class="underline">{m.nav_legal()}</a>

			<!--
				Which build this device is running.

				There is no server to ask and no way to push an update: a device runs
				whatever it last installed, and a PWA can sit on a cached build for
				weeks. When a studio reports that something does not arrive, the first
				useful question is which build each device is on — and until this line
				existed, nobody could answer it, not even the person holding the device.

				In the footer because it is reference rather than news: nobody needs it
				until they need it, and then they need it on whatever screen they happen
				to be looking at.
			-->
			<span class="font-mono text-xs" data-testid="build-stamp" title={m.build_stamp_title()}>
				{buildStamp({ locale: getLocale() })}
			</span>
		</div>
	</footer>
</div>
