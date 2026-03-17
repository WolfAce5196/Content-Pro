// Patch window.fetch and globalThis.fetch to be writable if they are getter-only properties
// This prevents errors like "Cannot set property fetch of #<Window> which has only a getter"
// when libraries try to polyfill fetch.
const patchFetch = (target: any, name: string) => {
  try {
    if (!target) return;
    
    const descriptor = Object.getOwnPropertyDescriptor(target, 'fetch') || 
                       Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) || {}, 'fetch');
    
    if (descriptor && (!descriptor.writable || descriptor.get || !descriptor.configurable)) {
      console.log(`[FetchPatch] Patching fetch on ${name}. Configurable: ${descriptor.configurable}`);
      
      const originalFetch = target.fetch;
      
      try {
        // Try to redefine it as a simple writable property
        Object.defineProperty(target, 'fetch', {
          value: originalFetch,
          writable: true,
          configurable: true,
          enumerable: true
        });
        console.log(`[FetchPatch] Successfully made ${name}.fetch writable via value descriptor`);
      } catch (e) {
        console.warn(`[FetchPatch] Failed to make ${name}.fetch writable via value, trying getter/setter:`, e);
        
        // Fallback to getter/setter if value redefinition fails
        let currentFetch = originalFetch;
        try {
          Object.defineProperty(target, 'fetch', {
            get() { return currentFetch; },
            set(v) { currentFetch = v; },
            configurable: true,
            enumerable: true
          });
          console.log(`[FetchPatch] Successfully made ${name}.fetch writable via getter/setter`);
        } catch (e2) {
          console.error(`[FetchPatch] All attempts to patch ${name}.fetch failed:`, e2);
          
          // Last resort: if it's configurable, try to delete and re-assign
          if (descriptor.configurable) {
            try {
              delete target.fetch;
              target.fetch = originalFetch;
              console.log(`[FetchPatch] Successfully patched ${name}.fetch via delete and re-assign`);
            } catch (e3) {
              console.error(`[FetchPatch] Delete and re-assign also failed for ${name}.fetch:`, e3);
            }
          }
        }
      }
    } else if (!descriptor) {
      // If it doesn't exist on the target or prototype, we might want to ensure it's writable if added later
      // but usually we just care about existing fetch
      console.log(`[FetchPatch] No fetch descriptor found on ${name}, skipping.`);
    }
  } catch (e) {
    console.warn(`[FetchPatch] Error in patchFetch for ${name}:`, e);
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

// Test the patch
try {
  if (typeof window !== 'undefined') {
    const oldFetch = window.fetch;
    window.fetch = oldFetch;
    console.log('[FetchPatch] Test successful: window.fetch is writable');
  }
} catch (e) {
  console.error('[FetchPatch] Test failed: window.fetch is still not writable:', e);
}

export {};
