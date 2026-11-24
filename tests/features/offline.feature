@offline
Feature: Prepared workouts work without a network connection

  Scenario: The install manifest and real icons respect the production base
    Given a fresh PWA visitor using "movenet"
    Then the install manifest and icons are local and installable

  Scenario Outline: Each prepared provider really runs after an offline cold navigation
    Given a fresh PWA visitor using "<model>"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    When I disconnect and open a previously unseen workout link
    Then the unseen workout survives an offline reload
    And the real "<model>" detector infers locally while offline
    And a previously unseen root workout query can start offline

    Examples:
      | model     |
      | mediapipe |
      | movenet   |

  Scenario: An interrupted model download cannot advertise readiness
    Given a fresh PWA visitor using "movenet"
    When a model shard download is interrupted during preparation
    Then the incomplete provider is not ready offline
    When I retry preparation with the network restored
    Then offline preparation reports complete assets and progress

  Scenario: Evicted model data revokes readiness and can be downloaded again
    Given a fresh PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    When a cached model shard is evicted and I disconnect
    Then the evicted provider loses its offline readiness
    When I retry preparation with the network restored
    Then offline preparation reports complete assets and progress

  Scenario: Insufficient storage offers Retry without claiming readiness
    Given a fresh PWA visitor using "movenet"
    When storage capacity is exhausted during preparation
    Then the storage failure keeps readiness incomplete and offers Retry
    When storage capacity is restored and I retry
    Then offline preparation reports complete assets and progress

  Scenario Outline: Unprepared models are explained in the selected language
    Given a fresh PWA visitor using "movenet"
    When I disconnect without preparing a provider in "<language>"
    Then the offline options explain the uncached model in "<language>"

    Examples:
      | language |
      | en       |
      | nl       |

  Scenario Outline: An uncached selection offers the already prepared provider
    Given a fresh PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    And I select an uncached provider offline in "<language>"
    Then the cached alternative is explained in "<language>"

    Examples:
      | language |
      | en       |
      | nl       |

  Scenario: An installed update waits instead of replacing an active workout
    Given a fresh update PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    When a new service worker is installed during an active workout
    Then the update waits without reloading or replacing the active worker
    And the workout finishes with its original repetition count and timer
    When I finish reviewing and explicitly apply the update
    Then the new build controls the page without claiming old models are ready
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
