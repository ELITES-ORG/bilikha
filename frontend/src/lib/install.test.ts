import { describe, expect, it } from 'vitest';
import { installHint } from './install';

/**
 * The instructions this drives are read by people who will not work out that
 * the menu item is somewhere else. Wrong advice sends them hunting through
 * settings for something their browser has never had, so each branch is pinned
 * against a real user agent string rather than a guess at one.
 */

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 13; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('installHint', () => {
  it('sends every iOS browser to the Share sheet, Chrome included', () => {
    // Every browser on iOS is WebKit underneath, so the route is the same one.
    expect(installHint(UA.iphoneSafari, false)).toBe('ios');
    expect(installHint(UA.iphoneChrome, false)).toBe('ios');
  });

  it('sends Android Chrome to the browser menu', () => {
    expect(installHint(UA.androidChrome, false)).toBe('android');
  });

  it('sends desktop Chromium to the address bar', () => {
    expect(installHint(UA.desktopChrome, false)).toBe('desktop');
    expect(installHint(UA.desktopEdge, false)).toBe('desktop');
  });

  it('says nothing to browsers that cannot install', () => {
    // Firefox has no install flow on either platform, and desktop Safari's
    // route is different enough that wrong words are worse than none.
    expect(installHint(UA.desktopFirefox, false)).toBe('none');
    expect(installHint(UA.androidFirefox, false)).toBe('none');
    expect(installHint(UA.desktopSafari, false)).toBe('none');
  });

  it('says nothing once the app is already installed', () => {
    // Otherwise the installed app tells you to install it.
    expect(installHint(UA.androidChrome, true)).toBe('none');
    expect(installHint(UA.iphoneSafari, true)).toBe('none');
    expect(installHint(UA.desktopChrome, true)).toBe('none');
  });
});
