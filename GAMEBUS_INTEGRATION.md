# Embedding Allez in GameBus

Use the Allez root URL as an external page or embedded task. Allow the Allez origin to submit `executeHomeWorkout` and, for a task, associate that template with the task. Cross-origin camera practice requires HTTPS, an iframe with `allow="camera"`, and a parent Permissions Policy that permits that delegation. Allez cannot grant itself camera access.

After `IFRAME_READY`, GameBus can supply the `settings` item in the `allez` input collection. Example `INPUT_COLLECTIONS` message:

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
