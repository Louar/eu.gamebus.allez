import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['.agents/**', '.github/skills/**', 'project.inlang/**', '_INPUT/**'] },
	js.configs.recommended,
	ts.configs.recommendedTypeChecked,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			parserOptions: { projectService: true },
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{ files: ['scripts/**/*.mjs'], extends: [ts.configs.disableTypeChecked] },
	{
		files: ['tests/*.test.ts'],
		// node:test manages the promises returned by top-level test registrations.
		rules: {
			'@typescript-eslint/no-floating-promises': [
				'error',
				{ allowForKnownSafeCalls: [{ from: 'package', name: 'test', package: 'node:test' }] }
			]
		}
	},
	{
		files: ['src/lib/components/ui/button/button.svelte'],
		rules: { 'svelte/no-navigation-without-resolve': 'off' }
	}
);
