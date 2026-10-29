import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://constrivia.test';

function worker(options = {}) {
  const listeners = new Map();
  const cache = {
    match: vi.fn(async () => options.cached === undefined ? undefined : new Response(options.cached)),
    put: vi.fn(async (_request, _response) => { if (options.failWrites) throw new Error('Quota exceeded'); }),
  };
  const caches = { open: vi.fn(async () => { if (options.failOpen) throw new Error('Storage unavailable'); return cache; }) };
  const fetch = vi.fn(async () => new Response('current version'));
  runInNewContext(source, {
    self: { location: { origin }, addEventListener: (type, listener) => listeners.set(type, listener) },
    caches, fetch, URL, Request, Response,
  });
  const request = (path, headers) => {
    let response;
    const lifetime = [];
    listeners.get('fetch')({
      request: new Request(origin + path, { headers }),
      respondWith: value => { response = value; },
      waitUntil: value => { lifetime.push(value); },
    });
    return { response, lifetime };
  };
  return { request, fetch, caches, cache };
}

describe('service worker network and cache boundaries', () => {
  it.each(['/api/json/list', '/api/json/drawing.ctr'])('leaves mutable cloud data %s to the network, even with old cached data', path => {
    const sw = worker({ cached: 'outdated cloud data' });
    expect(sw.request(path).response).toBeUndefined();
    expect(sw.caches.open).not.toHaveBeenCalled();
  });

  it.each(['/assets/app.js', '/index.html'])('keeps a successful response for %s when the cache is full', async path => {
    const sw = worker({ failWrites: true });
    const result = sw.request(path);
    const response = await result.response;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('current version');
    await Promise.all(result.lifetime);
  });

  it.each(['/assets/app.js', '/index.html'])('loads %s when browser cache storage is unavailable', async path => {
    const sw = worker({ failOpen: true });
    const result = sw.request(path);
    expect(await (await result.response).text()).toBe('current version');
    await Promise.all(result.lifetime);
  });

  it('retains the worker until a cached static asset finishes refreshing', async () => {
    const sw = worker({ cached: 'cached asset' });
    let finish;
    sw.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const result = sw.request('/assets/app.js');
    expect(await (await result.response).text()).toBe('cached asset');
    expect(result.lifetime.length).toBeGreaterThan(0);
    finish(new Response('new asset'));
    await Promise.all(result.lifetime);
    expect(sw.cache.put).toHaveBeenCalledTimes(1);
    expect(await sw.cache.put.mock.calls[0][1].text()).toBe('new asset');
  });

  it('still serves cached assets and HTML offline', async () => {
    const sw = worker({ cached: 'offline copy' });
    sw.fetch.mockRejectedValue(new Error('Offline'));
    for (const path of ['/assets/app.js', '/index.html']) {
      const result = sw.request(path);
      expect(await (await result.response).text()).toBe('offline copy');
      await Promise.all(result.lifetime);
    }
  });
});
