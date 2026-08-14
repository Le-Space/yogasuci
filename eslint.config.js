import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			// The three vite `define` replacements (vite.config.js). Declared here
			// rather than only for Svelte files: the module that reads them is plain
			// JavaScript, so that they were listed only under the Svelte block was a
			// rule about where they *happened* to be used, not about what they are.
			globals: {
				...globals.browser,
				...globals.node,
				__APP_VERSION__: 'readonly',
				__BUILD_DATE__: 'readonly',
				__COMMIT__: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { svelteConfig }
		}
	},
	{
		// The legal page renders its links from data, so the rule cannot see that
		// the target is an absolute external URL. `resolve()` is for app routes;
		// pointing it at https://le-space.de would be wrong, not merely noisy.
		//
		// Scoped to this one file rather than turned off globally: the rule is
		// worth keeping everywhere an internal link could be written by hand.
		files: ['src/routes/legal/+page.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': ['error', { ignoreLinks: true }]
		}
	},
	{
		// `_`-prefixed bindings are the deliberate destructure-to-drop used in
		// signingPayload; everything else unused in the ledger is a real mistake.
		files: ['src/lib/ledger/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }]
		}
	}
];
