import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const basePath = process.env.BASE_PATH ?? '/allez.gamebus.eu';
const baseURL = `http://127.0.0.1:4173${basePath}/`;

export default defineConfig({
	testDir: defineBddConfig({ features: 'tests/features/*.feature', steps: 'tests/steps/*.ts' }),
	fullyParallel: true,
	workers: 3,
	use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'allow' },
	webServer: [
		{
			command: 'node scripts/build-e2e.mjs && node scripts/serve-static.mjs',
			env: { BASE_PATH: basePath, VITE_REPLAY: 'true' },
			url: baseURL,
			timeout: 180_000
		},
		{
			command: 'node scripts/serve-static.mjs',
			env: {
				BASE_PATH: basePath,
				VITE_REPLAY: 'true',
				PORT: '4175',
				TEST_DEPLOYMENT_SWITCH: 'true'
			},
			url: `http://127.0.0.1:4175${basePath}/`,
			timeout: 180_000
		}
	]
});
