import { chromium } from 'playwright';

const HTTPS_BASE = 'https://localhost:5174';
const HTTP_BASE = 'http://localhost:5173';

const routesToCheck = [
  '/',
  '/profile',
  '/notifications',
  '/feed',
  '/jobs',
  '/events',
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const result = {
    positive: {
      loginPass: false,
      routes: [],
      error: null,
    },
    negative: {
      insecureGuardSeen: false,
      noLoginLoop: false,
      finalUrl: null,
      error: null,
    },
  };

  try {
    await page.goto(HTTPS_BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });

    if (page.url().includes('/auth/')) {
      await page.waitForSelector('#username', { timeout: 45000 });
      await page.waitForSelector('#password', { timeout: 45000 });
      await page.fill('#username', 'e2e_admin');
      await page.fill('#password', 'pass123');
      await Promise.all([
        page.waitForURL((url) => {
          const s = url.toString();
          return s.startsWith(HTTPS_BASE) && !s.includes('/auth/');
        }, { timeout: 45000 }),
        page.click('#kc-login'),
      ]);
    }

    await page.waitForLoadState('networkidle', { timeout: 45000 });
    result.positive.loginPass = page.url().startsWith(HTTPS_BASE) && !page.url().includes('/auth/');

    for (const route of routesToCheck) {
      const url = `${HTTPS_BASE}${route}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 45000 });
      const html = await page.content();
      const ok =
        !html.includes('Authentication Setup Required') &&
        page.url().startsWith(HTTPS_BASE) &&
        !page.url().includes('/auth/');
      result.positive.routes.push({ route, pass: ok, finalUrl: page.url() });
    }
  } catch (e) {
    result.positive.error = String(e?.message || e);
  }

  const page2 = await context.newPage();
  try {
    await page2.goto(HTTP_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page2.waitForTimeout(1500);
    const html = await page2.content();
    result.negative.insecureGuardSeen = html.includes('Authentication Setup Required') || html.includes('Authentication requires HTTPS origin');
    result.negative.finalUrl = page2.url();
    result.negative.noLoginLoop = !page2.url().includes('/auth/');
  } catch (e) {
    result.negative.error = String(e?.message || e);
  }

  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
