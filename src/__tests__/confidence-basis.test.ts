import { Confidence } from "@/lib/contract/d1";

describe("Confidence basis extension", () => {
  it("accepts alias basis at high confidence", () => {
    const result = Confidence.safeParse({ score: 0.95, basis: "alias" });
    expect(result.success).toBe(true);
  });

  it("accepts fuzzy basis at or below 0.75", () => {
    expect(Confidence.safeParse({ score: 0.75, basis: "fuzzy" }).success).toBe(true);
  });

  it("rejects fuzzy basis above 0.75", () => {
    expect(Confidence.safeParse({ score: 0.8, basis: "fuzzy" }).success).toBe(false);
  });

  it("still caps external-cached at 0.5 (regression)", () => {
    expect(Confidence.safeParse({ score: 0.6, basis: "external-cached" }).success).toBe(false);
    expect(Confidence.safeParse({ score: 0.5, basis: "external-cached" }).success).toBe(true);
  });
});
