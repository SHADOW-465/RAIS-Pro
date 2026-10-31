process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { authedHeaders } from "@/__tests__/fixtures/auth";
import { __setRemedyStoreForTests, type RemedyRead, type RemedyStore } from "@/lib/remedies/store";
import { GET } from "../route";

const empty: RemedyRead = { source: "unavailable", book: { defects: {}, trends: [] } };

const unavailable: RemedyStore = {
  read: async () => empty,
  saveDefect: async () => empty,
  saveTrend: async () => empty,
  removeTrend: async () => empty,
  importIfEmpty: async () => empty,
};

afterEach(() => {
  __setRemedyStoreForTests(undefined);
});

describe("GET /api/remedies", () => {
  it("returns 503 naming the remedies migration when the table is missing", async () => {
    __setRemedyStoreForTests(unavailable);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await GET(new NextRequest("http://localhost/api/remedies", {
        headers: await authedHeaders("operator"),
      }));
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const body = await res.json();
      expect(body.error).toContain("20261013_defect_remedies.sql");
      expect(body.source).toBe("unavailable");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("returns the plant book when the table is present", async () => {
    const res = await GET(new NextRequest("http://localhost/api/remedies", {
      headers: await authedHeaders("gm"),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("db");
    expect(body.book.defects).toEqual({});
  });
});
