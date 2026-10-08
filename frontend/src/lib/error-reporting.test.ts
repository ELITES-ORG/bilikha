import { AxiosError } from 'axios';
import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it } from 'vitest';
import { isReportable, isReportableUncaught, routePattern } from './error-reporting';
import { redactText, scrubEvent } from './error-reporting-client';

describe('routePattern', () => {
  it('keeps the words of a route', () => {
    expect(routePattern('/')).toBe('/');
    expect(routePattern('/account/security')).toBe('/account/security');
    expect(routePattern('/postings/new')).toBe('/postings/new');
  });

  it('reports a slug or an id as :param, never itself', () => {
    expect(routePattern('/creatives/juan-cruz')).toBe('/creatives/:param');
    expect(routePattern('/postings/3f2a9c1e-0000-4000-8000-000000000000/edit')).toBe(
      '/postings/:param/edit',
    );
    expect(routePattern('/admin/profiles/42')).toBe('/admin/profiles/:param');
  });

  it('reports anything typed into the address bar as :param', () => {
    expect(routePattern('/09171234567')).toBe('/:param');
  });
});

describe('isReportable', () => {
  it('reports a thrown error', () => {
    expect(isReportable(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(true);
  });

  it('leaves API failures to the API, and a dropped connection is not a bug', () => {
    expect(isReportable(new AxiosError('Request failed with status code 500'))).toBe(false);
    expect(isReportable(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
  });

  it('ignores the null a cross-origin script error leaves', () => {
    expect(isReportable(null)).toBe(false);
    expect(isReportable(undefined)).toBe(false);
  });

  it('reports a failed chunk when the boundary hands it over after its reload', () => {
    expect(isReportable(new TypeError('Failed to fetch dynamically imported module'))).toBe(true);
  });
});

describe('isReportableUncaught', () => {
  it('ignores a failed chunk, which is a tab open across a deploy', () => {
    expect(isReportableUncaught(new TypeError('Failed to fetch dynamically imported module'))).toBe(false);
  });

  it('still reports an ordinary error', () => {
    expect(isReportableUncaught(new Error('boom'))).toBe(true);
  });
});

describe('redactText', () => {
  it('blanks what the engine quotes back from the text it failed on', () => {
    // The real message, from V8 — the engine Chrome and Node share. A short
    // input is quoted whole: `Unexpected token 'j', "juan@example.com" is not valid JSON`.
    let message = '';
    try {
      JSON.parse('juan@example.com');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('juan@example.com');
    expect(redactText(message)).not.toContain('juan@example.com');
    expect(redactText(message)).toContain('[email]');
  });

  it('blanks a phone number in any common spelling', () => {
    for (const phone of ['09171234567', '+639171234567', '0917 123 4567', '+63 917-123-4567']) {
      expect(redactText(`reply to ${phone} failed`)).toBe('reply to [phone] failed');
    }
  });

  it('leaves an ordinary error alone', () => {
    const message = "Cannot read properties of undefined (reading 'id')";
    expect(redactText(message)).toBe(message);
  });
});

describe('scrubEvent', () => {
  it('keeps the error and the browser, and drops everything about the person', () => {
    const event = {
      event_id: 'abc',
      release: 'd10b699a1b2c',
      tags: { route: '/creatives/:param' },
      user: { ip_address: '203.0.113.9' },
      request: {
        url: 'https://bilikha.vercel.app/directory?q=juan',
        headers: { Referer: 'https://facebook.com/?fbclid=x', Cookie: 'bilikha.sid=s' },
      },
      breadcrumbs: [{ category: 'ui.input', message: 'typed 09171234567' }],
      extra: { body: 'hello neighbour' },
      contexts: { react: { componentStack: 'at Offer' }, culture: { locale: 'fil-PH' } },
      exception: { values: [{ value: 'boom for +639171234567', stacktrace: { frames: [{ filename: 'a.js', vars: { q: 'juan' } }] } }] },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event, 'Mozilla/5.0 [FBAN/FB4A]');

    expect(Object.keys(scrubbed).sort()).toEqual(
      ['contexts', 'event_id', 'exception', 'release', 'request', 'tags'].sort(),
    );
    expect(scrubbed.request).toEqual({ headers: { 'User-Agent': 'Mozilla/5.0 [FBAN/FB4A]' } });
    expect(scrubbed.contexts).toEqual({ react: { componentStack: 'at Offer' } });
    expect(scrubbed.exception?.values?.[0]?.value).toBe('boom for [phone]');
    expect(JSON.stringify(scrubbed)).not.toMatch(/juan|09171234567|hello neighbour|fbclid|bilikha\.sid/);
  });
});
