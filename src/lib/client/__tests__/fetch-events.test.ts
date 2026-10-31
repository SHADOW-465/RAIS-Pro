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
