import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPut } from '../functions/api/json/[key]';

describe('cloud file modification metadata', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const context = (bytes: Uint8Array) => ({ params: { key: 'test file.ctr' }, env: { CF_ACCOUNT_ID: 'account', CF_KV_NAMESPACE_ID: 'namespace', CF_API_TOKEN: 'test-token' }, request: new Request('https://example.test/api/json/test', { method: 'PUT', body: new Uint8Array(bytes).buffer }) });
  it('stores binary CTR bytes unchanged and adds the server save time in the same write', async () => {
    const bytes = new Uint8Array([0, 255, 80, 75, 1, 2]);
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch); vi.spyOn(Date, 'now').mockReturnValue(123456789);
    const response = await onRequestPut(context(bytes));
    expect(response.ok).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('/values/test%20file.ctr');
    const form = options.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(new Uint8Array(await (form.get('value') as Blob).arrayBuffer())).toEqual(bytes);
    expect(JSON.parse(form.get('metadata') as string)).toEqual({ modifiedAt: 123456789 });
    expect(new Headers(options.headers).has('Content-Type')).toBe(false);
  });
  it('reports an unsuccessful KV write instead of reporting a saved file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
    const response = await onRequestPut(context(new Uint8Array()));
    expect(response.status).toBe(503);
  });
});
