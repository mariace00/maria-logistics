// lib/browser.js
// Shared headless-Chromium launcher, used by both carrier checkers. Carrier
// tracking pages are JavaScript-rendered apps - a plain fetch() only ever
// sees an empty "please enable JavaScript" shell, never real data. This
// actually runs the page like a real browser would, so the site's own
// JavaScript populates the tracking data, same as it would for a person
// looking at it in Chrome.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

let browserPromise = null;

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  return browserPromise;
}

/**
 * Opens a page, navigates to url, and gives the caller a chance to either
 * (a) capture a JSON XHR/fetch response the page makes internally, matching
 *     urlIncludes, or (b) evaluate a JS expression once the page has
 *     settled (e.g. reading a global variable the site's own script sets).
 * Returns { capturedJson, html, evaluated }.
 */
export async function renderAndCapture(url, { urlIncludes, evaluateFn, waitMs = 6000 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  let capturedJson = null;
  const seenResponses = [];
  page.on('response', async (res) => {
    try {
      const reqUrl = res.url();
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('application/json') && !reqUrl.includes('.js') && !reqUrl.includes('.css')) {
        seenResponses.push(reqUrl);
      }
      if (capturedJson) return;
      if (urlIncludes && urlIncludes.some((frag) => reqUrl.includes(frag)) && ct.includes('application/json')) {
        const json = await res.json().catch(() => null);
        if (json) capturedJson = json;
      }
    } catch {
      // ignore individual response parse failures, keep listening
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
  } catch {
    // page may still have partially rendered / fired the responses we want
  }

  await new Promise((r) => setTimeout(r, waitMs));

  let evaluated = null;
  if (evaluateFn) {
    try {
      evaluated = await page.evaluate(evaluateFn);
    } catch {
      evaluated = null;
    }
  }

  const html = await page.content().catch(() => '');
  const pageTitle = await page.title().catch(() => '');
  await page.close().catch(() => {});

  return { capturedJson, html, evaluated, seenResponses, pageTitle, htmlLength: html.length };
}

  return { capturedJson, html, evaluated };
}
