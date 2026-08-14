<script>
	/**
	 * A dialog, built on the native `<dialog>` element.
	 *
	 * Native rather than a div with a high z-index, because `showModal()` brings
	 * the awkward parts already correct: focus moves in and is trapped, the page
	 * behind goes inert, Escape closes, and focus returns to whatever opened it.
	 * Every one of those is a thing a hand-rolled overlay gets wrong first and
	 * discovers later, usually from somebody using a keyboard.
	 *
	 * The caller keeps ownership of `open`. A dialog that closes itself on save
	 * would be wrong here: whether a save succeeded is the caller's business, and
	 * closing over an error message is how a studio loses what it just typed.
	 */
	import * as m from '$lib/paraglide/messages.js';

	let { open = $bindable(false), title, testid = 'modal', children } = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialog = $state();

	// Driven by the prop rather than by calling showModal() at the call site, so
	// there is one source of truth for "is this open" and the markup can stay
	// declarative.
	$effect(() => {
		if (!dialog) return;

		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<!--
	`close` fires for Escape and for the backdrop as well as for our own button, so
	the binding is kept honest from one place rather than three.
-->
<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	data-testid={testid}
	class="w-[min(40rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-0 text-text backdrop:bg-black/40"
>
	<div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
		<h2 class="text-lg font-medium">{title}</h2>
		<button
			type="button"
			data-testid="{testid}-close"
			onclick={() => (open = false)}
			aria-label={m.modal_close()}
			class="rounded-control px-2 py-1 text-muted hover:bg-surface-raised hover:text-text"
		>
			×
		</button>
	</div>

	<!--
		Scrolls inside the dialog rather than growing past the viewport: the course
		form is long, and on a phone in landscape the save button would otherwise
		sit below the fold with no way to reach it.
	-->
	<div class="max-h-[70vh] overflow-y-auto px-6 py-4">
		{@render children?.()}
	</div>
</dialog>
