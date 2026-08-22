<script>
	/**
	 * A screen that belongs behind the desk.
	 *
	 * The navigation already hides these from a device that cannot use them, but a
	 * URL is a URL: a bookmark, a shared link, or the owner's own device before it
	 * has finished replicating the registry will all land here. Without this they
	 * landed on a heading and an empty page, which reads like the app is broken.
	 *
	 * It says which of the two it is, because they need different answers. A device
	 * that has not joined a studio at all needs to pair; an approved device that is
	 * merely waiting for the registry needs to do nothing but wait.
	 */
	import { resolve } from '$app/paths';
	import { canEditStore, joinedStudioStore } from '$lib/db/join.js';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	let isCounter = $derived($canEditStore);

	// "Knows a studio but is not part of it" is the ordinary student case; knowing
	// no studio at all means this device has never paired with anything.
	let joined = $derived($joinedStudioStore);
</script>

{#if isCounter}
	{@render children?.()}
{:else}
	<section
		class="mt-6 rounded-card border border-border bg-surface p-6"
		data-testid="counter-only"
		data-joined={joined}
	>
		<h2 class="eyebrow">{m.counter_only_title()}</h2>
		<p class="mt-2 max-w-xl text-muted">
			{joined ? m.counter_only_joined() : m.counter_only_unpaired()}
		</p>

		<a
			href={resolve(joined ? '/program' : '/connect')}
			data-testid="counter-only-action"
			class="mt-4 inline-block rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-contrast no-underline"
		>
			{joined ? m.counter_only_to_program() : m.counter_only_to_connect()}
		</a>
	</section>
{/if}
