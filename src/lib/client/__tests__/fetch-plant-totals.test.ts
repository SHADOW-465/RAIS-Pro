import { fetchPlantTotals } from "../fetchers";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("fetchPlantTotals posts the ledger window and returns the payload", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
    jsonResponse({ headlines: { totalChecked: 10 }, source: "js" }),
  );
  const got = await fetchPlantTotals({
    dateBasis: "lot",
    datePreset: "all",
    from: "2026-01-01",
    to: "2026-06-08",
    span: "all",
  });
  expect(got.headlines.totalChecked).toBe(10);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe("/api/analytics/totals");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    dateBasis: "lot",
    from: "2026-01-01",
    to: "2026-06-08",
    span: "all",
  });
});

test("a 401 or a failed totals response throws instead of returning zeros", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(jsonResponse({ error: "no" }, 401))
    .mockResolvedValueOnce(jsonResponse({ error: "down" }, 500));
  await expect(fetchPlantTotals({})).rejects.toThrow("totals 401");
  await expect(fetchPlantTotals({})).rejects.toThrow("totals 500");
});
