import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
	plugins: [
		{
			name: 'offline-provider-inventory',
			resolveId(id) {
				if (id === 'virtual:offline-providers') return '\0offline-providers';
			},
			load(id) {
				if (id !== '\0offline-providers') return;
				// The service worker is built after the client. Read its exact hashed chunk names.
				const manifest = JSON.parse(
					readFileSync('.svelte-kit/output/client/.vite/manifest.json', 'utf8')
				) as Record<string, { name?: string; file: string }>;
				const providers = Object.fromEntries(
					['mediapipe', 'movenet'].map((model) => {
						const files = Object.values(manifest)
							.filter((entry) => entry.name === `pose-${model}`)
							.map((entry) => entry.file);
						if (!files.length) throw new Error(`Missing ${model} runtime chunk`);
						return [model, files];
					})
				);
				return `export default ${JSON.stringify(providers)}`;
			}
		},
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}`, relative: false },
			serviceWorker: { register: false },
			...(process.env.BUILD_VERSION ? { version: { name: process.env.BUILD_VERSION } } : {}),
			adapter: adapter({
				pages:
					process.env.BUILD_OUTPUT ??
					(process.env.VITE_REPLAY === 'true' ? 'build-replay' : 'build'),
				fallback: '404.html'
			})
		}),

		paraglideVitePlugin({
			strategy: ['cookie', 'baseLocale'],
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true
		})
	],
	environments: {
		client: {
			build: {
				rolldownOptions: {
					output: {
						codeSplitting: {
							groups: [
								{ name: 'pose-movenet', test: /node_modules\/@tensorflow\// },
								{ name: 'pose-mediapipe', test: /node_modules\/@mediapipe\// }
							]
						}
					}
				}
			}
		}
	}
});
