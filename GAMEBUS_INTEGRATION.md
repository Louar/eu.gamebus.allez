# Embedding Allez in GameBus

Use the Allez root URL as an external page or embedded task. Allow the Allez origin to submit `executeHomeWorkout` and, for a task, associate that template with the task. Cross-origin camera practice requires HTTPS, an iframe with `allow="camera"`, and a parent Permissions Policy that permits that delegation. Allez cannot grant itself camera access.

## Configure a task

After `IFRAME_READY`, an embedded task can supply the circuit directly in `TASK.data.configuration.workoutDefinition`. No input collection is required. For example, this task selects three distinct exercises once and repeats that circuit twice:

```json
{
	"type": "TASK",
	"data": {
		"configuration": { "workoutDefinition": { "steps": 3, "rounds": 2, "rest": 5 } }
	}
}
```

For an explicit circuit, use an array instead of a step count, for example `{ "v": 1, "steps": [{ "exercise": "squat", "reps": 8 }], "repeat": { "rounds": 2 } }`. Explicit circuits specify their target under `repeat`; random recipes use top-level `rounds`. See the [workoutDefinition JSON Schema](workoutDefinition.schema.json) for all variants and limits.

## Configure a page or supply fallback settings

Pages do not receive `TASK`. For a page, or a task whose configuration or workout definition is missing or null, Allez uses the `settings` item in the `allez` input collection, then falls back to the URL and built-in defaults. When a task supplies a definition, it overrides the entire collection or URL circuit regardless of message order. Collection settings can still supply `model` and `sound`. Example `INPUT_COLLECTIONS` message:

```json
{
	"type": "INPUT_COLLECTIONS",
	"data": {
		"allez": {
			"settings": { "steps": 3, "rounds": 2, "rest": 5, "model": "movenet", "sound": false }
		}
	}
}
```

`steps` and `rounds` are positive integers. Allez samples distinct exercises from its catalog (up to the catalog size) and repeats that circuit each round. `rest` is automatic rest in whole seconds; a new recipe defaults to zero. Alternatively, set `workout` to an explicit v1 Allez workout, an encoded workout string, or `{ "steps": 3, "rounds": 2 }`. The same compact recipe can be base64url-encoded in an existing workout link. `rounds` and `rest` can also override an existing circuit without replacing its exercises. `model` accepts `mediapipe` or `movenet`; `sound` is a boolean. Host settings take precedence over the link. The planner passes the selected exercises, not the recipe, into practice.

Selecting **Start workout** in practice sends one `SILENT_ACTIVITY` create. Each completed exercise queues a full replacement for the same activity; rest intervals count toward elapsed time but do not create `workoutStep` properties. Allez emits one-based round and step positions in each `workoutStep`. The `workoutRounds` output counts completed rounds, unlike the `rounds` input, which sets the target. Finishing sends the final active duration and completion flag. Early stops do not claim the workout or unfinished exercise was completed. Only workout metrics leave the iframe, not video or poses.

Reporting requires GameBus's correlated `ACTIVITY_RESULT` contract. Allez waits for the committed ID before sending updates and stops reporting that run on a rejected or timed-out write rather than creating a duplicate. Standalone workouts do not send activities.

## Activity property schemas

Every create and full-replacement update includes one `workoutDefinition` property. Its `obj` is the explicit v1 workout used by the session, including the chosen exercises when the task requested a random workout. It has no `value` wrapper. The same [JSON Schema](workoutDefinition.schema.json) applies to the task input and the activity property.

Each key below is a GameBus property-template slug. Its schema validates the `obj` field, not the surrounding `{ "template", "obj" }` message entry. Only `workoutStep` allows multiple entries. `duration` remains unchanged.

```json
{
	"workoutRounds": {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type": "object",
		"properties": { "value": { "type": "integer", "minimum": 0 } },
		"required": ["value"],
		"additionalProperties": false
	},
	"isCompleted": {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type": "object",
		"properties": { "value": { "type": "boolean" } },
		"required": ["value"],
		"additionalProperties": false
	},
	"workoutQuality": {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type": "object",
		"properties": { "value": { "type": "integer", "minimum": 0, "maximum": 100 } },
		"required": ["value"],
		"additionalProperties": false
	},
	"workoutStep": {
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type": "object",
		"properties": {
			"round": { "type": "integer", "minimum": 0 },
			"step": { "type": "integer", "minimum": 0 },
			"exercise": { "type": "string" },
			"quality": { "type": "integer", "minimum": 0, "maximum": 100 },
			"duration": {
				"type": "object",
				"properties": {
					"value": { "type": "integer", "minimum": 0 },
					"unit": { "const": "SECONDS" }
				},
				"required": ["value", "unit"],
				"additionalProperties": false
			},
			"repetitions": { "type": "integer", "minimum": 0 }
		},
		"required": ["round", "step", "exercise"],
		"additionalProperties": false
	}
}
```
