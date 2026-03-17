// Patch window.fetch and globalThis.fetch to be writable if they are getter-only properties
// This prevents errors like "Cannot set property fetch of #<Window> which has only a getter"
// when libraries try to polyfill fetch.
const patchFetch = (target: any, name: string) => {
  try {
    if (!target) return;
    
    // Check if fetch is already writable
    const descriptor = Object.getOwnPropertyDescriptor(target, 'fetch') || 
                       Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) || {}, 'fetch');
    
    if (descriptor && (!descriptor.writable || descriptor.get)) {
      console.log(`[FetchPatch] Patching fetch on ${name}. Configurable: ${descriptor.configurable}`);
      
      let currentFetch = target.fetch;
      
      try {
        Object.defineProperty(target, 'fetch', {
          get() { return currentFetch; },
          set(v) { 
            console.log(`[FetchPatch] fetch on ${name} is being set to a new value`);
            currentFetch = v; 
          },
          configurable: true,
          enumerable: true
        });
        console.log(`[FetchPatch] Successfully patched ${name}.fetch with getter/setter`);
      } catch (e) {
        console.warn(`[FetchPatch] Failed to defineProperty on ${name}.fetch:`, e);
        
        // If defineProperty fails, try deleting and assigning if configurable
        if (descriptor.configurable) {
          try {
            delete target.fetch;
            target.fetch = currentFetch;
            console.log(`[FetchPatch] Successfully patched ${name}.fetch via delete/assign`);
          } catch (e2) {
            console.error(`[FetchPatch] Final attempt failed for ${name}.fetch:`, e2);
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[FetchPatch] Error patching fetch on ${name}:`, e);
  }
};

// Apply patch to common globals
if (typeof window !== 'undefined') patchFetch(window, 'window');
if (typeof self !== 'undefined') patchFetch(self, 'self');
if (typeof globalThis !== 'undefined') patchFetch(globalThis, 'globalThis');

// Also try to patch the prototype if possible
if (typeof Window !== 'undefined' && Window.prototype) {
  patchFetch(Window.prototype, 'Window.prototype');
}

export {};
