// Patch window.fetch and globalThis.fetch to be writable if they are getter-only properties
// This prevents errors like "Cannot set property fetch of #<Window> which has only a getter"
// when libraries try to polyfill fetch.
const patchFetch = (target: any) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'fetch');
    if (descriptor && descriptor.configurable && (descriptor.get || !descriptor.writable)) {
      const originalFetch = target.fetch;
      Object.defineProperty(target, 'fetch', {
        value: originalFetch,
        writable: true,
        configurable: true,
        enumerable: true
      });
      console.log(`Successfully patched ${target === window ? 'window' : 'globalThis'}.fetch to be writable`);
    }
  } catch (e) {
    console.warn(`Failed to patch fetch on ${target === window ? 'window' : 'globalThis'}:`, e);
  }
};

patchFetch(window);
if (typeof globalThis !== 'undefined' && globalThis !== (window as any)) {
  patchFetch(globalThis);
}
if (typeof (window as any).global !== 'undefined' && (window as any).global !== window && (window as any).global !== (globalThis as any)) {
  patchFetch((window as any).global);
}

export {};
