# Implementation brief for Codex · Alez: a home workout tracker

Build a single-person, camera-based home workout app in the existing Svelte 5 / SvelteKit project. Use TypeScript, shadcn-svelte (ie, use the shadcn-svelte skill), the project's preconfigured Paraglide setup with English (`en`) and Dutch (`nl`), npm and adapter-static. Deployable output must work under a GitHub Pages repository subpath. The URL describes a prescribed workout. The app credits only the current exercise. If squats are prescribed and the user does jumping-jacks, leave the counter at zero and display “Waiting for a squat.” The measure of performance is completed reps or observed hold time.

Make the UI modern and clean.

## Workout links

Use `?workout=<base64url>`, where the value is unpadded Base64URL of UTF-8 JSON. Express all workout times in seconds. Keep exercise IDs stable across languages. Use a shared parser/validator for the URL and an editable setup screen with a Copy workout link action. Opening a link displays the decoded prescription. Request the camera after user interaction. A missing link opens setup. A malformed or unsupported prescription opens setup with a localized, actionable error.

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

Encoded query for the example above:

```text
?workout=eyJ2IjoxLCJyZXN0IjoxNSwic3RlcHMiOlt7ImV4ZXJjaXNlIjoic3F1YXQiLCJyZXBzIjoxMH0seyJleGVyY2lzZSI6Imp1bXBpbmctamFjayIsImR1cmF0aW9uIjoyMH0seyJyZXN0IjoxMH0seyJleGVyY2lzZSI6InBsYW5rIiwiaG9sZCI6MzB9XSwicmVwZWF0Ijp7InJvdW5kcyI6M319
```

- A round is one pass through the ordered steps. Omitted repeat means one pass. Exactly one of `rounds` (total passes, including the first) and `duration` (total active workout clock in seconds) is allowed inside `repeat`. For example, replace the repeat object with `{"duration":600}` to cycle through the same steps for ten minutes.
- Each exercise step accepts exactly one target. `reps` advances after the required number of complete cycles for a dynamic exercise. `duration` advances at the interval deadline regardless of tracking, displaying reps for dynamic exercises and verified hold seconds for static exercises. `hold` requires one uninterrupted observed hold for plank or squat-hold. A lone exercise without a preset target can be tried in practice.
- Optional top-level `rest` sets the break between consecutive exercises, including the transition into a new round. It defaults to zero. Insert it only when another exercise follows and the two exercises have no explicit rest between them. An explicit `{"rest":10}` schedules exactly ten seconds at that position and replaces the automatic break there. In the example, rest 15 seconds after squats, 10 after jumping-jacks, and 15 between plank and the next round. Finish immediately after the last plank.
- Validate a supported version, known exercise IDs, positive safe integers for targets and explicit rest steps, a nonnegative safe integer for the workout-level rest, a nonempty sequence with at least one exercise, compatible target types and a single repeat rule. Bound payload size before decoding. Preserve repeated occurrences of the same exercise as distinct steps.
- Proposed timer defaults: start the workout clock after practice and the initial countdown. Include exercise intervals and scheduled rests. Explicit pause and page backgrounding suspend all clocks. A tracking loss during an active workout leaves interval and circuit clocks running. A circuit deadline ends the workout even mid-step. Keep earned reps and measured hold time and mark the step partial. Discard incomplete reps. A timed circuit reports complete rounds plus progress in the final round.
- Drive deadlines from monotonic timestamps rather than frame count or counting timer callbacks. At exercise boundaries, ignore late inference results from the previous step. On pause, interruption or provider change, invalidate in-progress motion and reacquire a starting posture. Never credit an unobserved time gap.

## What the user sees

1. **Setup.** Show the ordered workout, targets, round count or time budget, and any rest intervals. Let the user choose a supported landmark model under settings. Load only the selected model and its assets. Explain locally processed video in plain language.
2. **One pre-workout practice screen.** Let the user choose any of the eight exercises, including one outside the configured circuit. Use the actual tracker and model. Show a recognized practice rep or a short verified hold, allow retries, and offer Start workout. Practice counters and time never carry into the workout. Start each subsequent exercise directly.
3. **During exercise.** Show a mirrored preview with an aligned skeleton, the current exercise name, round and step, and a large Tabata-style readout. For reps show “7 / 10”. For a dynamic interval show “7 reps · 00:12 left”. For a timed plank show “18 s held · 00:12 left”. For a continuous hold show “18 / 30 s”. For rest show remaining rest time and the next exercise. For a timed circuit, keep the overall time remaining visible as a secondary readout. Include Pause, Resume and Finish.
4. **Movement demonstration.** Play a silent looping animation or local video in a corner during practice and each exercise. Supply eight exercise-specific demos. Hand-authored animated skeletons are suitable. Use the same movement definitions for demos and trackers. Keep the inset clear of the counters, provide a reduced-motion sequence of key poses, and adapt to portrait and landscape.
5. **Tracking feedback.** Show detected phases, pulse the counter only when credit is earned, and offer optional sound so floor exercises can be done without watching the screen. Distinguish “Waiting for a squat” from “Tracking lost” and give a concrete framing cue when identifiable. Pair color with text or line style. Provide actionable camera-denied/model-load errors and retry. Stop camera tracks and release model resources on exit.
6. **Summary.** Show results per step and round, including actual/target, interval rep totals, verified hold seconds, longest continuous hold and time with tracking lost as applicable. Keep summaries in memory. Use Paraglide for all visible and accessible text, exercise names, phase cues, errors and plurals in both English and Dutch. Keep the setup, counters, and audio cues usable without English-only strings.

## Landmark detection and exercise tracking

Define two independent TypeScript interfaces. An illustrative contract is:

```ts
interface LandmarkDetector {
  estimate(frame: ImageBitmap, timestamp: number): Promise<PoseFrame>;
  dispose(): Promise<void>;
}

interface ExerciseTracker {
  reset(exercise: ExerciseId): void;
  update(frame: PoseFrame): TrackingUpdate;
}
```

Document the shared types. Use seconds for application timestamps and durations. Convert units at the browser or detector SDK boundary when an API expects milliseconds. A PoseFrame carries monotonic time, source dimensions, provider identity, named keypoints with confidence/visibility where available, and an explicit missing-pose state. Specify image axes, aspect ratio, anatomical left/right and units. Undo detector resizing/letterboxing before mapping coordinates. Keep preview mirroring in the renderer. Preserve optional provider-specific landmarks and depth with declared units. Compute the common baseline from shared joints; thresholds and confidence semantics may differ by provider. A TrackingUpdate exposes phase, tracking status, completed-rep event, observed hold intervals and instruction message key. The session controller owns clocks, targets, rounds and results.

Implement selectable MediaPipe Pose Landmarker Full and MoveNet SinglePose Thunder first. Compare both on the same clips. Evaluate YOLO26n-pose through the TypeScript package @ultralytics/yolo and RTMO-s via a compatible ONNX export and onnxruntime-web as optional adapters. Check package/model distribution terms before bundling. For RTMO, reproduce input transforms and output decoding from the specific export, compare coordinates with reference output, and exercise the actual browser backend. Check static subpath asset resolution and test without special server headers. Expose an optional adapter after it passes the same browser and tracking checks. Pin supported model/runtime versions, lazy-load local assets, and keep video and landmarks on-device. Limit pending inference work to avoid displaying stale feedback.

## Exercises and recognition

Use a short sequence of reliable observations, with entry/exit thresholds and phase order. Tune thresholds against examples. Recognize one complete cycle per rep. Repeated frames in an end pose, ordinary standing and tracking gaps earn no reps. Preserve camera orientation as a useful feature while centering/scaling for body position and size. Give a camera-placement cue appropriate to each exercise.

| Exercise ID | Observable completion |
|---|---|
| push-up | Extended arms in high plank, lower under control, return to extension. |
| squat | Standing, lowered squat, return to standing. |
| jumping-jack | Feet together and arms down, feet apart with arms raised laterally overhead, then return. |
| front-jack | Start with feet together and arms at the sides. Jump feet apart as both arms rise forward to shoulder height. Jump feet together as both arms lower to the sides. Count once on returning to the starting pose. Validate a camera view that distinguishes forward from lateral motion. |
| sit-up | From lying back, rise to the defined seated position, then return to lying back. |
| squat-hold | Establish the lowered squat posture and verify it over time. |
| burpee | From standing, enter floor support, complete a push-up down and up, bring feet back under the body, jump and land. Require evidence of both the push-up and the jump before awarding one rep. |
| plank | Maintain the report's forearm-and-toes plank. Verify the tracked posture over time. |

For static exercises record accumulated verified time and longest continuous hold separately. Break a continuous hold on confirmed loss of posture or tracking, and on pause. Filter single-frame jitter with a documented, tested tolerance that never credits time across a material observation gap.

## Data, training and acceptance

Use _INPUT/student-report.md (or _INPUT/student-report.pdf) and the files under _INPUT/training-data as development inputs. The archive defines eight exercises but provides labeled landmark examples only for push-up, squat, jumping-jack and plank, across 12 source videos. The four detector exports cover many of the same frames. Match them by source/frame identity and keep them together when splitting data. Appendix A defines the four historical exercise postures. Do not infer the five burpee phase definitions from a state count alone.

Codex may train small models offline, including phase classifiers or short-window movement models. Start with an explainable temporal baseline and retain a learned model when it improves held-out results. Pin feature preprocessing, training inputs, split, seed, provider and model version. Export compact weights for local browser inference. Use real, independently labeled continuous examples for all eight exercises, with particular attention to the four missing classes, rests, partial reps and confusable movements. If examples are unavailable, implement the baseline and replay tests, identify exactly which exercise/provider combinations still lack real-world validation, and report that gap.

Acceptance checks:

- Round-trip a workout link and exercise both repeat modes on a static build served under a repository subpath. Verify model assets, WASM, demonstration media, complete English and Dutch screens and accessible labels, and no camera/landmark uploads.
- Test practice isolation, round count, default and explicit rests, round-boundary rests, absence of an automatic final rest, circuit expiry mid-rep, hold interruption, tab backgrounding, and late detector results at a step boundary using explicit timestamps.
- Replay labeled sets from held-out people or whole source videos. Report rep-count error per set, verified hold-time error, false credits on wrong movements/rest, and tracking loss per exercise and provider. Check playback and inference latency on representative phones, including iOS Safari, and a desktop browser. Distinguish measured device results from untested targets.
- Include negative cases: jumping-jacks during prescribed squats earn zero; squat-hold earns no repeated squat reps; a lateral jumping-jack earns zero during front-jacks; a burpee without a push-up or without a jump earns zero; an occlusion between two rep phases cannot complete a rep.

## Browser acceptance tests with Playwright-BDD

Deliver executable Gherkin `.feature` files and TypeScript step definitions using [Playwright-BDD](https://vitalets.github.io/playwright-bdd/). Configure feature and step discovery with `defineBddConfig()`, use its returned `testDir` in Playwright, and bind Given/When/Then steps with `createBdd()`. Add an npm script `test:e2e` that runs `bddgen && playwright test`. Configure Playwright to serve the built static app under its repository subpath. Run the suite and report results before handoff.

- Cover the user-visible acceptance checks above through the setup, practice, workout and summary screens. Include valid and malformed workout links, both repeat modes, rest overrides and round boundaries, tracking loss, and representative flows in English and Dutch. Assert counters, timers and localized feedback through visible text and accessible controls.
- Drive movement scenarios with a timestamped landmark replay fixture at the detector interface and a controllable clock. Run the production exercise tracker and session controller. Supply positive cases for all eight exercises and the wrong-exercise and partial-movement cases listed above. Tests must run without a physical webcam or real-time waits. Keep separate real-provider clip checks for model loading, inference and recognition quality.
- Express expected behavior in workout language. For example:

```gherkin
Feature: Count prescribed repetitions
  Scenario: Jumping-jacks do not count toward a squat target
    Given I have started an English workout prescribing 10 squats
    When I perform 3 jumping-jacks
    Then the squat counter shows 0 of 10
    And I see "Waiting for a squat"
    When I perform 1 complete squat
    Then the squat counter shows 1 of 10
```

## Reference implementations and model documentation

[MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) · [MoveNet](https://www.tensorflow.org/hub/tutorials/movenet) · [Ultralytics web SDK](https://github.com/ultralytics/inference/blob/main/web/README.md) · [Ultralytics licensing](https://www.ultralytics.com/license) · [RTMO ONNX model catalog](https://github.com/Tau-J/rtmlib#model-zoo) · [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
