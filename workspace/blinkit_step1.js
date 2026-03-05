const { chromium } = require('playwright');

(async () => {
  const phone = process.env.PHONE;
  if (!phone) throw new Error('PHONE env var required');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const out = { step: 'init', otpTriggered: false, note: '' };

  try {
    await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Try closing popups if any
    const closeSelectors = [
      'button[aria-label="Close"]',
      'button:has-text("Not now")',
      'button:has-text("No thanks")',
      'button:has-text("Close")'
    ];
    for (const sel of closeSelectors) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        try { await el.click({ timeout: 1500 }); } catch {}
      }
    }

    // Open login flow
    const loginCandidates = [
      'text=Login',
      'text=Sign in',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'a:has-text("Login")'
    ];

    let opened = false;
    for (const sel of loginCandidates) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        try {
          await el.click({ timeout: 3000 });
          opened = true;
          break;
        } catch {}
      }
    }

    if (!opened) {
      out.step = 'login_not_found';
      out.note = 'Could not find login button';
      await page.screenshot({ path: '/home/node/workspace/blinkit_step1.png', fullPage: true });
      console.log(JSON.stringify(out));
      await browser.close();
      return;
    }

    await page.waitForTimeout(1500);

    // Fill phone number
    const phoneInputs = [
      'input[type="tel"]',
      'input[placeholder*="mobile" i]',
      'input[placeholder*="phone" i]',
      'input[name*="phone" i]'
    ];

    let filled = false;
    for (const sel of phoneInputs) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        try {
          await el.fill(phone.replace(/\D/g, '').slice(-10), { timeout: 3000 });
          filled = true;
          break;
        } catch {}
      }
    }

    if (!filled) {
      out.step = 'phone_input_not_found';
      out.note = 'Could not find mobile input';
      await page.screenshot({ path: '/home/node/workspace/blinkit_step1.png', fullPage: true });
      console.log(JSON.stringify(out));
      await browser.close();
      return;
    }

    // Trigger OTP
    const otpButtons = [
      'button:has-text("Continue")',
      'button:has-text("Send OTP")',
      'button:has-text("Get OTP")',
      'button:has-text("Next")'
    ];

    let clicked = false;
    for (const sel of otpButtons) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        try {
          await el.click({ timeout: 3000 });
          clicked = true;
          break;
        } catch {}
      }
    }

    await page.waitForTimeout(2500);

    const bodyText = (await page.textContent('body') || '').toLowerCase();
    if (bodyText.includes('otp') || bodyText.includes('verification code')) {
      out.otpTriggered = true;
      out.step = 'otp_screen';
      out.note = 'OTP should be sent if rate limits allow';
    } else {
      out.step = clicked ? 'continue_clicked_but_uncertain' : 'otp_button_not_found';
      out.note = 'Could not confidently detect OTP screen';
    }

    await page.screenshot({ path: '/home/node/workspace/blinkit_step1.png', fullPage: true });
    console.log(JSON.stringify(out));
  } catch (e) {
    out.step = 'error';
    out.note = String(e.message || e);
    try { await page.screenshot({ path: '/home/node/workspace/blinkit_step1.png', fullPage: true }); } catch {}
    console.log(JSON.stringify(out));
  } finally {
    await browser.close();
  }
})();