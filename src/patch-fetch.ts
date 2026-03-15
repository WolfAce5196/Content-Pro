// Patch window.fetch and globalThis.fetch to be writable if they are getter-only properties
// This prevents errors like "Cannot set property fetch of #<Window> which has only a getter"
// when libraries try to polyfill fetch.
const patchFetch = (target: any, name: string) => {
  try {
    if (!target) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, 'fetch');
    if (descriptor) {
      console.log(`[FetchPatch] Found fetch on ${name}. Configurable: ${descriptor.configurable}, Writable: ${descriptor.writable}, HasGetter: ${!!descriptor.get}`);
      
      if (descriptor.configurable && (descriptor.get || !descriptor.writable)) {
        const originalFetch = target.fetch;
        try {
          // Try deleting first, then re-assigning
          delete target.fetch;
          target.fetch = originalFetch;
          console.log(`[FetchPatch] Successfully patched ${name}.fetch via delete/assign`);
        } catch (e) {
          // Fallback to defineProperty
          Object.defineProperty(target, 'fetch', {
            value: originalFetch,
            writable: true,
            configurable: true,
            enumerable: true
          });
          console.log(`[FetchPatch] Successfully patched ${name}.fetch via defineProperty`);
        }
      } else if (!descriptor.configurable) {
        console.warn(`[FetchPatch] Cannot patch ${name}.fetch because it is not configurable`);
      }
    } else {
      // If it's not on the object itself, it might be on the prototype
      const proto = Object.getPrototypeOf(target);
      if (proto && proto.fetch) {
        patchFetch(proto, `${name}.prototype`);
      }
    }
  } catch (e) {
    console.warn(`[FetchPatch] Error patching fetch on ${name}:`, e);
  }
};

patchFetch(window, 'window');
if (typeof Window !== 'undefined' && Window.prototype) patchFetch(Window.prototype, 'Window.prototype');
if (typeof self !== 'undefined') patchFetch(self, 'self');
if (typeof globalThis !== 'undefined') patchFetch(globalThis, 'globalThis');
if (typeof (window as any).global !== 'undefined') patchFetch((window as any).global, 'global');

export {};
