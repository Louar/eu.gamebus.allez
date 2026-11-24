# Alez

A single-person workout studio that runs on-device. Open a workout link or edit the example circuit, select a landmark model, then choose **Practice** to enable the camera. A three-second countdown separates practice from the workout. Switch between English and Dutch in setup. Nothing is recorded or uploaded; finishing a session releases the camera and keeps its summary in memory.

## Run locally

Use Node 22.18 or later and npm. From a clean checkout:

```sh
npm ci
npm run dev
```

The first dev/build run prepares the pinned model files (network access and `tar` required); subsequent builds reuse the verified assets. The browser fetches only the selected model from the same origin. Camera access needs localhost or HTTPS.

## Build for Pages

```sh
BASE_PATH=/allez.gamebus.eu npm run build
BASE_PATH=/allez.gamebus.eu node scripts/serve-static.mjs
```

Open `http://127.0.0.1:4173/allez.gamebus.eu/`. Deploy the complete `build/` directory. Omit `BASE_PATH` when building for a domain root. The included GitHub Actions workflow uses the base path provided by Pages; select **GitHub Actions** as the repository's Pages source. No special server headers or runtime server are required. Do not deploy `build-replay/`.

## Workout links

`?workout=` carries unpadded Base64URL of UTF-8 JSON, limited to 16,384 encoded characters. **Copy workout link** generates it using the same validator that opens incoming links.

```json
{
	"v": 1,
	"rest": 15,
	"steps": [
		{ "exercise": "squat", "reps": 10 },
		{ "exercise": "jumping-jack", "duration": 20 },
		{ "rest": 10 },
		{ "exercise": "plank", "hold": 30 }
	],
	"repeat": { "rounds": 3 }
}
```

All times are seconds. `reps` counts completed cycles, `hold` requires a continuous verified posture, and `duration` ends on time even if tracking is lost. Replace `rounds` with `duration` for a timed circuit. Explicit rest steps occupy their own positions and replace adjacent automatic breaks. Pausing or backgrounding the page freezes the clocks; press Resume to continue. Practice can use any exercise, whether prescribed or not.

## Verification

```sh
npm run check
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run test:providers
```

`test:unit` covers geometry, phase order, clocks and link validation. `test:e2e` generates Playwright tests from Gherkin, builds a separate static site at a repository subpath, and replays timestamped landmarks through the production tracker and session controller. The replay clock and injection hook are absent from the production build. `test:providers` instead runs both actual detectors on the same decoded video frames; the default check requires FFmpeg and access to the archive's source video.

**Recognition is a baseline, not a validated fitness assessment.** Both providers counted the held-out squat and timed the full-body plank, and neither credited squats during jumping-jacks. They also missed both push-ups and all three jumping-jacks in the short prescribed positive sets. The four other movements have replay coverage but lack independent continuous-video validation on either provider. Physical phone performance, including iOS Safari, has not been measured.

- [Evaluation](EVALUATION.md): source splits, per-set errors, false credits, tracking loss and coverage gaps.
- [Provider report](docs/providers.md): coordinate contracts, model versions, asset provenance, latency, RTMO parity and the optional-provider licensing decisions.
- `src/lib/motion.ts` defines the detector/tracker interfaces, pose sequences and tracker rules. `src/lib/workout.ts` owns prescriptions, clocks, epochs and results. Video mirroring is a renderer concern only.
