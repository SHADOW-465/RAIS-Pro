import { fetchEvents } from "../fetchers";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("fetchEvents follows nextCursor until the ledger page is done", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(jsonResponse({ events: [{ eventId: "a" }], nextCursor: "cursor-1" }))
    .mockResolvedValueOnce(jsonResponse({ events: [{ eventId: "b" }], nextCursor: null }));
  const got = await fetchEvents({ span: "all" });
  expect(got.events.map((e) => e.eventId)).toEqual(["a", "b"]);
  expect(got.unauthorized).toBe(false);
  const first = String(fetchMock.mock.calls[0]?.[0]);
  const second = String(fetchMock.mock.calls[1]?.[0]);
  expect(first).toContain("span=all");
  expect(second).toContain("cursor=cursor-1");
});

test("a payload without nextCursor is a single page", async () => {
  jest.spyOn(global, "fetch").mockResolvedValueOnce(jsonResponse({ events: [{ eventId: "only" }] }));
  const got = await fetchEvents({ from: "2026-01-01", to: "2026-01-31" });
  expect(got.events.map((e) => e.eventId)).toEqual(["only"]);
  expect(jest.mocked(global.fetch).mock.calls).toHaveLength(1);
});

test("pages after the first are read in parallel by offset when the server echoes it", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://x");
    const offset = Number(url.searchParams.get("offset"));
    const ids = offset === 0 ? ["a", "b"] : ["c", "d", "e"];
    return jsonResponse({ events: ids.map((eventId) => ({ eventId })), total: 5, offset, nextCursor: offset === 0 ? "c" : null });
  });
  // Server page size is 2500 in prod; here the first page returns 2 rows.
  const got = await fetchEvents({ span: "all" });
  expect(new Set(got.events.map((e) => e.eventId))).toEqual(new Set(["a", "b", "c", "d", "e"]));
  expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("cursor="))).toBe(true);
});

test("a total that changes mid-read falls back to the cursor walk", async () => {
  let n = 0;
  const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    n++;
    const url = new URL(String(input), "http://x");
    if (url.searchParams.has("offset")) {
      const offset = Number(url.searchParams.get("offset"));
      return offset === 0
        ? jsonResponse({ events: [{ eventId: "a" }], total: 2, offset: 0, nextCursor: "k" })
        : jsonResponse({ events: [{ eventId: "b" }], total: 3, offset, nextCursor: null });
    }
    return url.searchParams.has("cursor")
      ? jsonResponse({ events: [{ eventId: "b" }, { eventId: "z" }], nextCursor: null })
      : jsonResponse({ events: [{ eventId: "a" }], nextCursor: "k" });
  });
  const got = await fetchEvents({ span: "all" });
  expect(got.events.map((e) => e.eventId)).toEqual(["a", "b", "z"]);
  expect(n).toBe(fetchMock.mock.calls.length);
});
