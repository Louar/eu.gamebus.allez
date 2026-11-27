# Motion tracker evaluation

**All 16 movements have synthetic landmark replay coverage. The tracker is not validated as an accurate general-purpose rep counter.** On short held-out video sets, both current detectors counted one squat correctly and timed one plank correctly, but neither counted the two push-ups or the three jumping-jacks. The historical frame results and the live-model clip results below measure different things.

## Current providers: continuous video

The tracker was frozen before scoring. We extracted 640-pixel-wide, 10 fps clips from the archive's original source URLs without bundling or uploading video. We visually reviewed all 30 sampled images per clip, separately from model output. A rep requires the starting pose, excursion and return _within the window_; a partly observed rep is not rounded up. Hold ground truth covers the 2.9 s between the first and last observations, not the file's 3.0 s duration. These are small manually reviewed examples, not an independently adjudicated multi-rater benchmark.

Results from the compiled subpath browser harness, Chromium 159.0.8154.6 on macOS arm64. Model pairs saw identical video timestamps. Each result is **earned (signed error); tracker-lost frames / 30**.

| Source, start in seconds (each window 3 s) | Prescribed                | Visual reference                           | MediaPipe Full  | MoveNet Thunder |
| ------------------------------------------ | ------------------------- | ------------------------------------------ | --------------- | --------------- |
| `_knIf9vF4k4`, 101.0                       | push-up                   | 2 reps; third descent incomplete           | 0 (-2); 0/30    | 0 (-2); 4/30    |
| `tmEeghaHoz0`, 337.4                       | squat                     | 1 rep; next descent incomplete             | 1 (0); 0/30     | 1 (0); 0/30     |
| `_knIf9vF4k4`, 282.7                       | jumping-jack              | 3 closed/open/closed cycles                | 0 (-3); 0/30    | 0 (-3); 0/30    |
| `_knIf9vF4k4`, 545.0                       | plank                     | 2.9 s forearm-and-toes hold                | 2.9 s (0); 0/30 | 2.9 s (0); 0/30 |
| `_knIf9vF4k4`, 282.7                       | squat during jacks        | 0 squats                                   | 0 (0); 0/30     | 0 (0); 0/30     |
| `_knIf9vF4k4`, 10.0                        | squat during introduction | 0 squats; standing speaker then title card | 0 (0); 15/30    | 0 (0); 30/30    |

No false squat credit on these two negative windows does not establish a population false-positive rate. The oblique push-up foreshortens the torso, and only one frame on each detector passed the jack's open-pose rule. A usable landmark detection is not the same as a matching posture.

Two additional plank windows expose limitations. At `_knIf9vF4k4` 531.0 s the ankles are outside the crop, so a human cannot verify toe support: Full nevertheless credited 0.8 s (19/30 lost), Thunder 0 s (30/30 lost). At `tmEeghaHoz0` 1659.6 s the performer raises alternating legs rather than maintaining an ordinary plank: Full and Thunder both credited 0 s (0/30 and 30/30 lost). We do not relabel either window as a verified continuous 2.9 s hold.

To reproduce any row, substitute its source, start and prescribed ID. Use Node 22.18+, FFmpeg, the project's locked dependencies and Playwright Chromium. The remote source video is needed only by this offline evaluation, not by the workout application.

```sh
source_id=_knIf9vF4k4; start=545; exercise=plank
ffmpeg -ss "$start" -i "https://www.projectraoul.nl/research/fitness-videos/serve/$source_id.mp4" \
  -t 3 -vf 'scale=640:-2,fps=10' -an -c:v libvpx-vp9 /tmp/alez-eval.webm
node scripts/check-providers.mjs /tmp/alez-eval.webm "$exercise"
```

## Historical exports: posture labels, not reps

`_INPUT/student-report.md` Appendix A defines jumping-jack state 1 as open, 2 as closed; push-up 1 extended, 2 lowered; squat 1 standing, 2 lowered; plank 1 forearm-supported. `postures-grid.csv` names four more exercises but contains no training labels for them. The burpee sequence is taken from the workout brief, not inferred from the archive's state count.

`scripts/evaluate-motion.mjs` joins on the annotated **frame ID**, including source identity, and deduplicates repeated IDs. There are 1,729 unique annotations from 12 labeled source videos, not four independent datasets; 1,709 IDs appear in all four detector exports. `sources-grid.csv` also lists videos with no labeled frames. Some frame IDs and the frame-grid timestamp field disagree; no continuous trajectory is reconstructed from these sparse annotations.

The nine development sources contributed 1,183 frames. Three **whole sources**, `_knIf9vF4k4`, `tmEeghaHoz0` and `3sEeVJEXTfY`, contributed 546 test frames covering all four labeled exercises. All exports of the same screenshot stay on the same side. This is a fixed source-wise split, not a verified person-wise split. No random split, classifier training, interpolation, temporal oversampling or learned weights. On development frames, loosening projected push-up straightness and support-plane tolerances increased correct push-up postures from 81 to 101/340 (BlazePose) and from 188 to 290/340 (Thunder) before the held-out run.

Cells are **correct exact phase / lost**, both counts out of the column denominator. The exercise is prescribed, not predicted. Missing exports, low confidence, wrong phase and abstentions are not counted as correct. Lost includes absent exports; `waiting` means insufficient geometric evidence despite usable landmark confidence. This is a still-frame loss measure, not seconds lost.

| Historical export            | Push-up (141) | Squat (95) | Jumping-jack (275) | Plank (35) | Correct / 546 |
| ---------------------------- | ------------: | ---------: | -----------------: | ---------: | ------------: |
| BlazePose                    |       53 / 17 |     87 / 1 |            130 / 2 |     14 / 8 |   284 (52.0%) |
| MoveNet SinglePose Thunder   |        71 / 4 |     87 / 7 |          123 / 111 |     11 / 7 |   292 (53.5%) |
| MoveNet SinglePose Lightning |       71 / 13 |     94 / 1 |          133 / 107 |     13 / 7 |   311 (57.0%) |
| PoseNet                      |        0 / 75 |     73 / 0 |            147 / 8 |     0 / 31 |   220 (40.3%) |

The archived detector revisions are not recorded in the CSV. Historical BlazePose is not a rerun of current MediaPipe Full. The exports do not contain reliable independently labeled complete sets, elapsed hold intervals or rest negatives, so rep/hold error cannot be computed from those CSVs alone.

## Rules and replay checks

The production tracker uses common 2D joints in source pixels. Joint angles and torso-length ratios reduce sensitivity to size; image vertical distinguishes upright from floor work. Jacks, alternating floor exercises, lunges and jumps require bilateral landmarks. Lunges and jumps also use foot positions relative to an observed standing baseline, so they require a stationary camera. A score below 0.25 fails the joint-confidence gate. This common cutoff is not a calibrated probability and reports very different loss rates across models. No optional depth or detector-specific joints are required.

The movement definitions drive both the state machine and demo sequence. Most phases require two agreeing observations; for short pogo and squat jumps, a single airborne observation between confirmed ground phases can suffice. Ankle elevation is a 2D proxy, not proof of takeoff. Burpees additionally require lowered and re-extended floor support, tuck and a landing. Front-jacks require an oblique view with both wrists projecting in the same direction at shoulder height; this is not validated for a straight-on camera.

Static holds accrue only between two matching observations. One ambiguous posture freezes the streak, excludes both adjacent intervals and does not add time; a second mismatch breaks it. Any missing/unreliable pose, provider change, explicit reset, or gap above 0.35 s invalidates continuity. The tracker has no workout clock and cannot credit a pause by itself.

```sh
node --test scripts/motion.test.mjs
node scripts/evaluate-motion.mjs --dev
node scripts/evaluate-motion.mjs
```

At 20 Hz the dynamic demos each produced 3/3 reps and the two hold demos each produced 1.45/1.45 s. Regression checks include mirrored cycles, opposite-direction lunges, same-side vs. opposite-side extensions, squats without takeoff, partial cycles, hold jitter and tracking loss. Synthetic fixtures check these definitions; they are not independent evidence of real-world exercise recognition.

## Limits on use

Only push-up, squat, jumping-jack and plank have the small paired video windows above. None of the other exercises has independently labeled real-video evaluation on either provider. No generalization claim for new people, camera heights, lighting, movement speeds or mobility variations; no reliable view-invariant proof of form or ground contact. Real rest/confusable examples for other prescriptions remain unmeasured. No representative Android or iOS Safari testing here. Chromium seeking and software inference at prerecorded timestamps are not live camera FPS or phone latency benchmarks. Optional YOLO and RTMO are not validated by this tracker evaluation.
