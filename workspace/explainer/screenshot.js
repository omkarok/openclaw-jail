/**
 * screenshot.js — Playwright script to screenshot all slides in index.html
 * Run inside container: node /home/node/workspace/explainer/screenshot.js
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const path = require('path');

const HTML_PATH = 'file:///home/node/workspace/explainer/index.html';
const FRAMES_DIR = '/home/node/workspace/explainer/frames';
const SLIDE_DURATION_MS = 1500; // wait after slide transition

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--force-device-scale-factor=1',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  console.log('Opening:', HTML_PATH);
  await page.goto(HTML_PATH, { waitUntil: 'networkidle' });

  // Wait for fonts/CSS to settle
  await page.waitForTimeout(1000);

  // Get total slide count from the page
  const totalSlides = await page.evaluate(() => window.totalSlides || 10);
  console.log('Total slides:', totalSlides);

  for (let i = 0; i < totalSlides; i++) {
    const slideNum = i + 1;
    console.log(`Screenshotting slide ${slideNum}/${totalSlides}...`);

    await page.evaluate((slideIdx) => window.goToSlide(slideIdx), i);
    await page.waitForTimeout(SLIDE_DURATION_MS);

    const filename = `slide_${String(slideNum).padStart(2, '0')}.png`;
    await page.screenshot({
      path: path.join(FRAMES_DIR, filename),
      fullPage: false,
    });

    console.log(`  Saved: ${filename}`);
  }

  await browser.close();
  console.log('Done. All slides captured.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
