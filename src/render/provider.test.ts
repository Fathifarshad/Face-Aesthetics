import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Consent } from '../data/types';
import { MockRenderProvider, renderProvider } from './mock';
import { cloudRender, renderBlock, RenderRefusedError, type RenderInput, type RenderProvider } from './provider';

type C = Pick<Consent, 'scope' | 'detail' | 'signedAt' | 'revokedAt'>;
const level2: C = { scope: 'cloudRender', signedAt: 1 };
const level1: C = { scope: 'analysis', signedAt: 1 };
const input: RenderInput = { photo: new Blob(['p']), guide: new Blob(['g']), regions: [] };

const spy = (): RenderProvider & { calls: number } => ({
  id: 'spy',
  remote: true,
  calls: 0,
  async render(i) {
    this.calls++;
    return { image: i.guide, providerId: 'spy', mock: false };
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('cloud render gate (PRD F4.8, rule 8)', () => {
  it('refuses while the clinic switch is off, even with consent', async () => {
    const p = spy();
    await expect(cloudRender(p, input, { enabled: false, consents: [level2] })).rejects.toThrow(RenderRefusedError);
    expect(p.calls).toBe(0);
    expect(renderBlock(false, [level2])).toBe('disabled');
  });

  it('refuses without a level-2 consent; level 1 is not enough', async () => {
    const p = spy();
    await expect(cloudRender(p, input, { enabled: true, consents: [level1] })).rejects.toMatchObject({ reason: 'noConsent' });
    expect(p.calls).toBe(0);
  });

  it('refuses after the consent is revoked', async () => {
    const p = spy();
    const revoked: C = { ...level2, revokedAt: 2 };
    await expect(cloudRender(p, input, { enabled: true, consents: [revoked] })).rejects.toMatchObject({ reason: 'noConsent' });
    expect(p.calls).toBe(0);
  });

  it('calls the provider with switch and live consent', async () => {
    const p = spy();
    expect(renderBlock(true, [level1, level2])).toBeNull();
    await cloudRender(p, input, { enabled: true, consents: [level1, level2] });
    expect(p.calls).toBe(1);
  });
});

describe('MockRenderProvider (PRD F4.11)', () => {
  it('is the app provider, is local, and returns the guide without any network call', async () => {
    const net = vi.fn(() => {
      throw new Error('network');
    });
    vi.stubGlobal('fetch', net);
    vi.stubGlobal('XMLHttpRequest', net);
    const p = renderProvider();
    expect(p).toBeInstanceOf(MockRenderProvider);
    expect(p.remote).toBe(false);
    const out = await new MockRenderProvider(0).render(input);
    expect(out).toEqual({ image: input.guide, providerId: 'mock', mock: true });
    expect(net).not.toHaveBeenCalled();
  });

  it('stops when aborted', async () => {
    const ctl = new AbortController();
    const run = new MockRenderProvider(1000).render(input, ctl.signal);
    ctl.abort();
    await expect(run).rejects.toThrow('aborted');
  });
});
