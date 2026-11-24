import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const baseURL = 'http://127.0.0.1:4173/allez.gamebus.eu/';

export default defineConfig({
	testDir: defineBddConfig({ features: 'tests/features/*.feature', steps: 'tests/steps/*.ts' }),
	fullyParallel: true,
	workers: 3,
	use: { baseURL, trace: 'retain-on-failure' },
	webServer: {
		command: 'npm run build && node scripts/serve-static.mjs',
		env: { BASE_PATH: '/allez.gamebus.eu', VITE_REPLAY: 'true' },
		url: baseURL,
		timeout: 180_000
	}
});
