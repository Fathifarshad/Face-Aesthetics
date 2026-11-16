import type { RenderInput, RenderProvider, RenderResult } from './provider';

/**
 * Stand-in provider (PRD F4.11): nothing leaves the device. It returns the browser preview it was given, so the
 * whole path (switch, consent, button, result, audit) can be built and tested before a real model is chosen.
 */
export class MockRenderProvider implements RenderProvider {
  readonly id = 'mock';
  readonly remote = false;

  constructor(private readonly delayMs = 300) {}

  async render(input: RenderInput, signal?: AbortSignal): Promise<RenderResult> {
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(done, this.delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        fail(new DOMException('aborted', 'AbortError'));
      });
    });
    return { image: input.guide, providerId: this.id, mock: true };
  }
}

/** The provider the app uses. Only the mock exists in phase 1. */
export const renderProvider = (): RenderProvider => new MockRenderProvider();
