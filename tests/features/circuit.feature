Feature: Follow the prescribed circuit on the static site

  Scenario: Opening setup requires neither a camera nor a detector download
    Given I open setup without a workout link
    Then setup offers both local models
    And the model and runtime files are served under the repository path

  Scenario: Practising the prescribed exercise does not earn workout reps
    Given my circuit prescribes 3 reps of "squat"
    When I practise "squat"
    And I perform 1 cycle of "squat"
    Then the practice counter shows one repetition
    When I leave practice and start the countdown
    Then the counter reads "0 / 3"

  Scenario: Edit, copy and reopen a workout link
    Given my circuit prescribes 3 reps of "squat"
    When I change the first target to 7 and copy the workout link
    And I open the copied workout link
    Then the editable target is 7 reps of "squat"

  Scenario: A malformed link opens an actionable setup screen
    Given I open a malformed link
    Then setup shows a link error and an edit action

  Scenario: Practice outside the circuit does not carry into a Dutch workout
    Given my circuit prescribes 2 reps of "squat"
    When I switch setup to Dutch
    And I open Dutch practice for "jumping-jack"
    And I perform 1 cycle of "jumping-jack"
    Then the practice counter shows one repetition
    When I start the Dutch workout
    Then the counter reads "0 / 2"
    And I can pause and resume in Dutch
    When I perform 2 cycles of "squat"
    Then I see the summary with 1 result
    And the Dutch summary reports the squat result

  Scenario: Default breaks, explicit breaks and round boundaries
    Given two rounds of one squat, one jumping-jack, a 4-second rest and one sit-up with 2 seconds between exercises
    When I start the workout after practice
    And I perform 1 cycle of "squat"
    Then a 2-second rest precedes "Jumping"
    When 2 seconds pass
    And I perform 1 cycle of "jumping-jack"
    Then a 4-second rest precedes "Sit"
    When 4 seconds pass
    And I perform 1 cycle of "sit-up"
    Then a 2-second rest precedes "Squat"
    When 2 seconds pass
    And I perform 1 cycle of "squat"
    And 2 seconds pass
    And I perform 1 cycle of "jumping-jack"
    And 4 seconds pass
    And I perform 1 cycle of "sit-up"
    Then I see the summary with 6 results

  Scenario: Circuit expiry preserves earned reps and discards an incomplete rep
    Given a 10-second circuit prescribing 5 reps of "squat"
    When I start the workout after practice
    Then the circuit clock shows "00:10"
    When I perform 1 cycle of "squat"
    And I start a squat without returning to standing
    And 10 seconds pass
    Then I see the summary with 1 result
    And the result includes "1 / 5"

  Scenario: Intervals run without tracking but freeze while backgrounded or paused
    Given my circuit prescribes 10 seconds of "jumping-jack"
    When I start the workout after practice
    And the camera loses my pose
    And I background the page for 30 seconds
    Then the counter reads "00:10"
    When I pause the workout for 30 seconds
    Then the counter reads "00:10"
    When 5 seconds pass
    Then the counter reads "00:05"
    When 5 seconds pass
    Then I see the summary with 1 result

  Scenario: Late detector results cannot leak into a repeated exercise
    Given two successive squat intervals of 2 and 10 seconds
    When I start the workout after practice
    And I remember the current detector request
    And 2 seconds pass
    And the old request delivers a complete squat
    Then the counter reads "00:10"
    And the interval repetition count reads "0 reps"
    When I perform 1 cycle of "squat"
    Then the interval repetition count reads "1 rep"
