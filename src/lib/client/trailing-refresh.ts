// One in-flight load, plus one more after it if anything asked meanwhile.
// Joining the in-flight request alone serves the snapshot from before a save.

export function createTrailingRefresh(run: () => Promise<void>): () => Promise<void> {
  let inflight: Promise<void> | null = null;
  let rerun = false;

  return async function refresh() {
    if (inflight) {
      rerun = true;
      await inflight;
      return;
    }
    inflight = (async () => {
      let error: unknown = null;
      do {
        rerun = false;
        try {
          await run();
          error = null;
        } catch (e) {
          error = e;
        }
      } while (rerun);
      if (error) throw error;
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  };
}
