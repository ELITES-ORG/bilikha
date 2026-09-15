import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  `${process.env.LOCALAPPDATA}/npm-cache/_npx/f0a362733743bae2/node_modules/playwright`,
);

const base = 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];

  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(`${base}/login`);
    await page.getByLabel('Username').fill('rl1789498643');
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/');
    await page.getByText('Your registration was not approved').waitFor({ timeout: 10000 });
    if (!(await page.getByText('Please use a complete craft description.').isVisible())) {
      errors.push('rejection reason not visible on home');
    }
    await page.goto(`${base}/admin`);
    await page.waitForURL('**/');
    if (page.url().includes('/admin')) errors.push('member was not redirected from /admin');
    await page.close();
  }

  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${base}/login`);
    await page.getByLabel('Username').fill('juantest');
    await page.getByLabel('Password').fill('new horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/');
    await page.getByRole('link', { name: 'Admin' }).click();
    await page.waitForURL('**/admin');
    await page.getByRole('heading', { name: 'Review queue' }).waitFor();
    await page.getByRole('link', { name: 'Juan dela Cruz' }).first().click();
    await page.waitForURL('**/admin/profiles/**');
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForURL('**/admin');
    await page.getByRole('button', { name: /Published/ }).click();
    await page.getByText('juantest').first().waitFor({ timeout: 10000 });
    await page.close();
  }

  {
    const page = await browser.newPage();
    await page.goto(`${base}/login`);
    await page.getByLabel('Username').fill('juantest');
    await page.getByLabel('Password').fill('new horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/');
    if (await page.getByText('Your registration is being reviewed').isVisible().catch(() => false)) {
      errors.push('pending banner still visible after approve');
    }
    await page.close();
  }

  await browser.close();

  if (errors.length) {
    console.error('BROWSER FAIL');
    for (const e of errors) console.error('-', e);
    process.exit(1);
  }
  console.log('BROWSER OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
