import { execFileSync } from 'node:child_process';

// Two genuine releases let browser tests exercise waiting workers and versioned cache migration.
const run = Date.now();
for (const [release, output] of [
	['current', 'build-replay'],
	['next', 'build-next']
]) {
	execFileSync('npm', ['run', 'build'], {
		stdio: 'inherit',
		env: {
			...process.env,
			VITE_REPLAY: 'true',
			BUILD_OUTPUT: output,
			BUILD_VERSION: `acceptance-${run}-${release}`
		}
	});
}
