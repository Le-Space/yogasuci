// The day view: what is on now, for somebody standing in the studio.
//
// The programme lists everything a studio offers, which is what a studio
// maintains and not what a person in the doorway wants. They want one class —
// the one that is on — and until this existed they had to read the whole list
// and work out which line applied to today (#76).
//
// The selection itself is proven without a browser in src/lib/program/today.spec.ts:
// weekday matching, validity windows, deactivated courses, ordering. What is
// left for a test with a screen is that the right thing reaches it — including
// on whichever day of the week this happens to run, which is why the weekday is
// computed here rather than written down.

import { expect, openCourseForm, test } from './fixtures.js';

const READY = { timeout: 90_000 };

/** Today and tomorrow as the weekday numbers the course form uses. */
const todayWeekday = new Date().getUTCDay();
const tomorrowWeekday = (todayWeekday + 1) % 7;

test.describe('today', () => {
	test('lists a class that runs today', async ({ alice }) => {
		test.setTimeout(300_000);

		await setUpStudio(alice);
		await addRecurringCourse(alice, {
			id: 'vinyasa-today',
			title: 'Vinyasa Flow',
			weekday: todayWeekday,
			time: '18:00'
		});

		await alice.getByTestId('tab-today').click();

		const row = alice.locator('[data-testid="today-item"][data-course-id="course:vinyasa-today"]');
		await expect(row).toBeVisible(READY);
		await expect(row).toContainText('18:00');
		await expect(alice.getByTestId('today-empty')).toHaveCount(0);
	});

	test('names the next class on a day with none', async ({ alice }) => {
		// An empty list is an answer and a poor one: it leaves somebody to open the
		// full programme and work the next date out themselves.
		test.setTimeout(300_000);

		await setUpStudio(alice);
		await addRecurringCourse(alice, {
			id: 'yin-tomorrow',
			title: 'Yin Yoga',
			weekday: tomorrowWeekday,
			time: '19:30'
		});

		await alice.getByTestId('tab-today').click();

		const empty = alice.getByTestId('today-empty');
		await expect(empty).toBeVisible(READY);
		await expect(empty).toContainText('Yin Yoga');
		await expect(empty).toContainText('19:30');
		await expect(alice.getByTestId('today-list')).toHaveCount(0);
	});

	test('opens on today rather than on the full programme', async ({ alice }) => {
		test.setTimeout(240_000);

		await setUpStudio(alice);

		await expect(alice.getByTestId('tab-today')).toHaveAttribute('aria-selected', 'true');
	});
});

/** @param {import('@playwright/test').Page} page */
async function setUpStudio(page) {
	await page.goto('/studio/?ice=host');
	await expect(page.getByTestId('onboarding')).toBeVisible(READY);
	await page.getByTestId('onboarding-user-id').fill('alice');
	await page.getByTestId('onboarding-submit').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);

	await page.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await page.getByTestId('studio-save').click();
	await expect(page.getByTestId('studio-save-state')).toHaveAttribute('data-state', 'saved', READY);

	await page.getByTestId('location-id').fill('altstadt');
	await page.getByTestId('location-name-de').fill('Studio Altstadt');
	await page.getByTestId('location-name-en').fill('Studio Altstadt');
	await page.getByTestId('location-add').click();
	await expect(page.locator('[data-location-id="location:altstadt"]')).toBeVisible(READY);

	await page.getByTestId('nav-program').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, title: string, weekday: number, time: string }} course
 */
async function addRecurringCourse(page, { id, title, weekday, time }) {
	await openCourseForm(page);
	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill(id);
	await page.getByTestId('course-location').selectOption('location:altstadt');
	await page.getByTestId('course-title-de').fill(title);
	await page.getByTestId('course-title-en').fill(title);
	await page.getByTestId('course-weekday').selectOption(String(weekday));
	await page.getByTestId('course-time').fill(time);
	await page.getByTestId('course-add').click();

	// Scoped to the programme row: the same course id is now on the day view too,
	// and an unscoped locator matches both.
	await expect(
		page.locator(`[data-testid="course-item"][data-course-id="course:${id}"]`)
	).toBeVisible(READY);
}
