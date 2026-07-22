const { test, expect } = require('@playwright/test');

test('register, login, and add post flow', async ({ page }) => {
    const username = `user${Date.now()}`;
    const password = 'testpass';

    await page.goto('/register');
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL('/');

    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await Promise.all([
        page.waitForNavigation(),
        page.click('button[type="submit"]'),
    ]);

    await expect(page.locator('h1')).toContainText('Welcome');

    await page.fill('textarea[name="content"]', 'Playwright test post');
    await Promise.all([
        page.waitForNavigation(),
        page.click('form[action="/add-post"] button[type="submit"]'),
    ]);

    await page.waitForSelector('ul.list-group');
    await expect(page.locator('ul.list-group')).toContainText('Playwright test post');
});
