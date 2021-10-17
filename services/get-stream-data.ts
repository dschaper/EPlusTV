import { chromium } from 'playwright';
import _ from 'lodash';

import { sleep } from './sleep';

export const getStreamData = async (eventId: string) => {
  console.log('Getting stream for event: ', eventId);
  const browser = await chromium.launch({
    channel: 'chrome',
  });
  const context = await browser.newContext({storageState: 'config/state.json'});
  const page = await context.newPage();

  let authToken = null;
  let m3u8 = null;
  let totalTries = 1000;
  let currentTry = 0;

  const close = async () => {
    await context.storageState({ path: 'config/state.json' });
    await context.close();
    await browser.close();
    return [m3u8, authToken];
  };

  page.on('request', async request => {
    if (request.url().indexOf('keys') > -1 && !authToken) {
      const isAuthToken = await request.headerValue('Authorization');
      authToken = isAuthToken && isAuthToken;
    }

    if (request.url().endsWith('m3u8') && request.url().indexOf('master') > -1 && !m3u8) {
      m3u8 = request.url();
    }
  });

  await page.goto(`https://www.espn.com/espnplus/player/_/id/${eventId}`, {
    waitUntil: 'domcontentloaded',
  });

  // Check to see if we're logged in
  while (!m3u8 || !authToken) {
    if (currentTry >= totalTries) {
      break;
    }
    await sleep(10);
    currentTry += 1;
  }

  if (m3u8 && authToken) {
    console.log('Got credentials from local storage');
    return await close();
  }

  try {
    // Not logged in, do it manually
    const pathSelector = 'xpath=//iframe[starts-with(@src,"https://plus.espn.com/en/paywall")]';
    await page.waitForSelector(pathSelector);
    const frame = await (await page.$(pathSelector)).contentFrame();

    if (frame) {
      await frame.click('text=Log In');
      await page.waitForSelector('#disneyid-iframe');
      const loginFrame = await (await page.$('#disneyid-iframe')).contentFrame();

      if (loginFrame) {
        await sleep(1000);
        await loginFrame.fill('xpath=//input[@type="email"]', process.env.ESPN_USER);
        await sleep(1000);
        await loginFrame.fill('xpath=//input[@type="password"]', process.env.ESPN_PASS);
        await sleep(1000);
        await page.screenshot({path: 'config/loginfilled.png'});
        await loginFrame.click('text=Log In');
        await sleep(1000);
        await page.screenshot({path: 'config/postclick.png'});
      }
    }
  } catch (e) {
    console.log('Could not find stream. Has the event ended?');
    return await close();
  }

  totalTries = 1500;
  currentTry = 0;

  while (!m3u8 || !authToken) {
    if (currentTry >= totalTries) {
      break;
    }
    await sleep(10);
    currentTry += 1;
  }

  return await close();
};
