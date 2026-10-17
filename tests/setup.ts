import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom não implementa scrollIntoView (usado pelo componente Select). O guarda
// é porque `setupFiles` roda também nos testes que declaram
// `@vitest-environment node` (`tests/tools/mutation-runner.test.ts`, que só
// lê arquivo): lá não existe `Element`, e este arquivo não pode presumir DOM.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // noop
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
