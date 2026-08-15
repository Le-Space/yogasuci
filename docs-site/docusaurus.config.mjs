// Docusaurus configuration for the user documentation.
//
// This site is for the people who run and attend classes — a studio owner, whoever
// is at the front desk, a student with a phone. It is deliberately separate from
// `docs/`, which is the engineering record: plan, limits, privacy analysis. Mixing
// the two would leave both audiences reading past each other.
//
// German is the default locale because the first studios are German-speaking, and
// English is a full second locale rather than a fallback.

import { themes } from 'prism-react-renderer';
import { execSync } from 'node:child_process';

import { currentRelease } from '../scripts/build-version.mjs';

// Which build of the handbook this is.
//
// The same three facts the app puts in its own footer, and for the same reason:
// the handbook is versioned by nothing except the moment it was published, so a
// studio reading a page that contradicts their screen has no way to tell which
// of the two is behind. The release comes from the same tag the app uses, so the
// two can be compared at a glance — which is the whole point of printing it.

function currentCommit() {
	// CI checks out a detached HEAD; GitHub hands the SHA over directly, which
	// describes what triggered the build rather than the checkout.
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);

	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		// A build from a tarball with no repository. One fact fewer, not a failure.
		return '';
	}
}

// UTC, unlike the app's footer. That one is read on the device it describes and
// is about "did this thing update"; this is one published page read from
// everywhere, so a fixed zone is the only reading everyone shares.
const buildStamp = [
	currentRelease(),
	currentCommit(),
	`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
]
	.filter(Boolean)
	.join(' · ');

/** @type {import('@docusaurus/types').Config} */
export default {
	title: 'Yogasūcī (योगसूची)',
	tagline: 'Kursbuchung ohne Server',
	favicon: 'img/favicon.svg',

	// Two homes, one build. Alongside the app on Aleph at /handbuch/, and on GitHub
	// Pages at /yogasuci/ — the second exists because Pages does not need DNS and is
	// therefore the one that works today. Both are set from the environment rather
	// than hard-coded, because a Docusaurus site with the wrong baseUrl builds
	// happily and then serves a page whose every asset 404s.
	url: process.env.DOCS_URL ?? 'https://yogasuci.le-space.de',
	baseUrl: process.env.DOCS_BASE_URL ?? '/handbuch/',

	organizationName: 'Le-Space',
	projectName: 'yogasuci',

	// A broken link in a handbook sends somebody looking for an answer to a 404,
	// so it fails the build rather than warning into a log nobody reads.
	onBrokenLinks: 'throw',
	onBrokenMarkdownLinks: 'throw',

	i18n: {
		defaultLocale: 'de',
		locales: ['de', 'en'],
		localeConfigs: {
			de: { label: 'Deutsch', htmlLang: 'de-DE' },
			en: { label: 'English', htmlLang: 'en-GB' }
		}
	},

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
					routeBasePath: '/',
					sidebarPath: './sidebars.mjs',
					editUrl: 'https://github.com/Le-Space/yogasuci/tree/main/docs-site/'
				},
				blog: false,
				theme: { customCss: './src/css/custom.css' }
			})
		]
	],

	themeConfig: {
		image: 'img/social-card.png',
		colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
		navbar: {
			title: 'Yogasūcī (योगसूची)',
			logo: { alt: 'Yogasūcī', src: 'img/om.svg' },
			items: [
				{ type: 'docSidebar', sidebarId: 'handbook', position: 'left', label: 'Handbuch' },
				{ type: 'localeDropdown', position: 'right' },
				{ href: 'https://github.com/Le-Space/yogasuci', label: 'GitHub', position: 'right' }
			]
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'App',
					items: [{ label: 'yogasuci.le-space.de', href: 'https://yogasuci.le-space.de' }]
				},
				{
					title: 'Technik',
					items: [
						{
							label: 'Grenzen des Entwurfs',
							href: 'https://github.com/Le-Space/yogasuci/blob/main/docs/LIMITS.md'
						},
						{
							label: 'Datenschutz-Analyse',
							href: 'https://github.com/Le-Space/yogasuci/blob/main/docs/PRIVACY.md'
						}
					]
				}
			],
			copyright: `Le-Space · Apache-2.0 OR MIT<br/><small>${buildStamp}</small>`
		},
		prism: { theme: themes.github, darkTheme: themes.dracula }
	}
};
