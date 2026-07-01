// Forces the memory store so this test never touches a real Supabase project.
process.env.MOID_STORE = "memory";

import { GET, POST } from "../route";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/datasets", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/datasets", () => {
  it("GET returns an empty list before anything is persisted", async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.datasets).toEqual([]);
  });

  it("POST persists datasets, then GET returns them", async () => {
    const dataset = {
      id: "abc123", signatureHash: "abc123", title: "Visual Inspection",
      columns: [], sources: [{ fileName: "a.xlsx", sheetName: "VISUAL", rowCount: 3 }], totalRows: 3,
    };
    const postRes = await POST(post({ datasets: [dataset] }));
    expect(postRes.status).toBe(200);

    const getRes = await GET();
    const json = await getRes.json();
    expect(json.datasets).toHaveLength(1);
    expect(json.datasets[0].id).toBe("abc123");
  });

  it("POST with an empty/missing datasets array is a 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });
});
