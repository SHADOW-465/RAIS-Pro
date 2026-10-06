import { createTrailingRefresh } from "../trailing-refresh";

test("a refresh asked during a fetch runs again after that fetch", async () => {
  let n = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refresh = createTrailingRefresh(async () => {
    n += 1;
    if (n === 1) await gate;
  });

  const first = refresh();
  const second = refresh();
  release();
  await first;
  await second;
  expect(n).toBe(2);
});

test("callers wait until the follow-up fetch finishes", async () => {
  const seen: number[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refresh = createTrailingRefresh(async () => {
    const turn = seen.length + 1;
    if (turn === 1) {
      seen.push(1);
      await gate;
      return;
    }
    seen.push(turn);
  });

  const first = refresh();
  const second = refresh();
  release();
  await second;
  await first;
  expect(seen).toEqual([1, 2]);
});

test("a failed fetch does not drop a refresh that was queued behind it", async () => {
  let n = 0;
  const refresh = createTrailingRefresh(async () => {
    n += 1;
    if (n === 1) {
      await Promise.resolve();
      throw new Error("stale");
    }
  });

  const first = refresh();
  const second = refresh();
  await expect(first).resolves.toBeUndefined();
  await second;
  expect(n).toBe(2);
});
