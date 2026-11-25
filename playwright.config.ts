import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const basePath = process.env.BASE_PATH ?? '/allez.gamebus.eu';
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}${basePath}/`;

export default defineConfig({
	testDir: defineBddConfig({ features: 'tests/features/*.feature', steps: 'tests/steps/*.ts' }),
	fullyParallel: true,
	workers: 3,
	use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'allow' },
	webServer: [
		{
			command: 'node scripts/build-e2e.mjs && node scripts/serve-static.mjs',
			env: { BASE_PATH: basePath, VITE_REPLAY: 'true', PORT: String(port) },
			url: baseURL,
			timeout: 180_000
		},
		{
			command: 'node scripts/serve-static.mjs',
			env: {
				BASE_PATH: basePath,
				VITE_REPLAY: 'true',
				PORT: String(port + 2),
				TEST_DEPLOYMENT_SWITCH: 'true'
			},
			url: `http://127.0.0.1:${port + 2}${basePath}/`,
			timeout: 180_000
		},
		{
			command: 'npm run preview',
			env: { BASE_PATH: basePath, BUILD_OUTPUT: 'build-replay', PORT: String(port + 3) },
			url: `http://127.0.0.1:${port + 3}${basePath}/`,
			timeout: 180_000
		}
	]
});
