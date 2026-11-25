import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { encodeWorkout } from '../../src/lib/workout';

const { Given, When, Then } = createBdd();

Then('I can enable sound in the preview settings', async ({ page }) => {
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	const sound = page.getByRole('menuitemcheckbox', { name: 'Sound cues', exact: true });
	await expect(sound).not.toBeChecked();
	await sound.click();
	await expect(sound).toBeChecked();
	await page.keyboard.press('Escape');
});

Then('I can toggle sound from the live settings', async ({ page }) => {
	await expect(page.getByRole('button', { name: 'Sound cues', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	const sound = page.getByRole('menuitemcheckbox', { name: 'Sound cues', exact: true });
	await expect(sound).toBeChecked();
	await sound.click();
	await expect(sound).not.toBeChecked();
	await sound.click();
	await expect(sound).toBeChecked();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
});

Given('a workout with two available cameras', async ({ page }) => {
	await page.addInitScript(() => {
		navigator.mediaDevices.enumerateDevices = () =>
			Promise.resolve(
				['Front camera', 'USB camera'].map((label, i) => ({
					deviceId: `camera-${i}`,
					groupId: `group-${i}`,
					kind: 'videoinput' as const,
					label,
					toJSON: () => ({})
				}))
			);
	});
	const encoded = encodeWorkout({ v: 1, steps: [{ exercise: 'squat', duration: 15 }] });
	await page.goto(`workouts/${encoded}/`);
	await expect(page.getByTestId('workout-preview')).toBeVisible();
});

Then('I can select a camera and model from the preview settings', async ({ page }) => {
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Camera', exact: true }).click();
	await page.getByRole('menuitemradio', { name: 'USB camera', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Studio settings' })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Model', exact: true }).click();
	await page.getByRole('menuitemradio', { name: /MoveNet/ }).click();
	await expect(page).toHaveURL(/model=movenet/);
	await expect(page.getByRole('button', { name: 'Studio settings' })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await expect(page.getByTestId('workout-preview')).toBeVisible();
	await expect(page.locator('video')).toHaveCount(0);
});

When('I enter practice with the selected settings', async ({ page }) => {
	await page.getByRole('button', { name: /Enable camera/ }).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
});

Then('I can change settings without leaving practice', async ({ page }) => {
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Camera', exact: true }).click();
	await expect(page.getByRole('menuitemradio', { name: 'USB camera' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await page.getByRole('menuitemradio', { name: 'Front camera' }).click();
	await expect(page.getByRole('button', { name: 'Studio settings' })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Model', exact: true }).click();
	await expect(page.getByRole('menuitemradio', { name: /MoveNet/ })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await page.getByRole('menuitemradio', { name: /MediaPipe/ }).click();
	await expect(page).toHaveURL(/model=mediapipe/);
	await expect(page.getByRole('button', { name: 'Studio settings' })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
	await expect(page.getByTestId('session-controls')).toBeInViewport({ ratio: 1 });
});

Then('changing the model pauses the workout without discarding progress', async ({ page }) => {
	const advance = (seconds: number) =>
		page.evaluate((seconds) => {
			(window as typeof window & { __alez: { advance(seconds: number): void } }).__alez.advance(
				seconds
			);
		}, seconds);
	await page.getByRole('button', { name: 'Start workout', exact: true }).click();
	await advance(5);
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'exercise');
	await expect(page.getByTestId('workout-clock')).toHaveText('00:02');
	await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Model', exact: true }).click();
	await page.getByRole('menuitemradio', { name: /MediaPipe/ }).click();
	await expect(page).toHaveURL(/model=mediapipe/);
	await advance(5);
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'exercise');
	await expect(page.getByTestId('workout-clock')).toHaveText('00:02');
	await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
