<script>
	/**
	 * Imprint and privacy statement.
	 *
	 * Outside StudioGate on purpose: these have to be readable before anybody
	 * creates a passkey, and by somebody who never will. A legal notice behind an
	 * identity gate is not a legal notice.
	 *
	 * The prose lives in $lib/legal/texts.js rather than in Paraglide — see the note
	 * at the top of that file for why, and why it is still bilingual.
	 */
	import { LEGAL } from '$lib/legal/texts.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let texts = $derived(LEGAL[getLocale() === 'de' ? 'de' : 'en']);
</script>

<h1 class="text-3xl font-bold">{m.legal_title()}</h1>

<section class="mt-8" data-testid="legal-imprint">
	<h2 class="text-2xl font-bold">{m.legal_imprint()}</h2>

	{#each texts.imprint as section (section.heading)}
		<div class="mt-6 rounded-card border border-border bg-surface p-6">
			<h3 class="eyebrow">{section.heading}</h3>
			{#each section.paragraphs as paragraph, index (index)}
				<p class="mt-2 max-w-2xl whitespace-pre-line text-muted">{paragraph}</p>
			{/each}

			{#if section.links}
				<p class="mt-2">
					{#each section.links as link (link.href)}
						<!--
							Same shape as the source link in the header: `noreferrer` as well
							as `noopener`, because there is no reason to tell the operator's
							own site which legal section somebody was reading when they left.
						-->
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							class="underline"
							data-testid="legal-link"
						>
							{link.label}
						</a>
					{/each}
				</p>
			{/if}
		</div>
	{/each}
</section>

<section class="mt-12" data-testid="legal-privacy">
	<h2 class="text-2xl font-bold">{m.legal_privacy()}</h2>

	{#each texts.privacy as section (section.heading)}
		<div class="mt-6 rounded-card border border-border bg-surface p-6">
			<h3 class="eyebrow">{section.heading}</h3>
			{#each section.paragraphs as paragraph, index (index)}
				<p class="mt-2 max-w-2xl whitespace-pre-line text-muted">{paragraph}</p>
			{/each}

			{#if section.links}
				<p class="mt-2">
					{#each section.links as link (link.href)}
						<!--
							Same shape as the source link in the header: `noreferrer` as well
							as `noopener`, because there is no reason to tell the operator's
							own site which legal section somebody was reading when they left.
						-->
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							class="underline"
							data-testid="legal-link"
						>
							{link.label}
						</a>
					{/each}
				</p>
			{/if}
		</div>
	{/each}
</section>
