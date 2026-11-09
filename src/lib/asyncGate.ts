/**
 * Drop overlapping async work. The second caller resolves to undefined
 * instead of running beside the first, so a follow-up bed move cannot
 * write plants from a snapshot the first move has already changed.
 */
export function createAsyncGate() {
  let busy = false;
  return {
    async run<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await task();
      } finally {
        busy = false;
      }
    },
  };
}
