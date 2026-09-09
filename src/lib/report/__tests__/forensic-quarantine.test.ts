import { readFileSync } from "fs";
import { join } from "path";
import ForensicBook from "@/components/report/ForensicBook";

const root = join(__dirname, "..", "..", "..", "..");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("forensic quarantine", () => {
  it("production report renderers do not import ForensicBook", () => {
    expect(src("src/components/report/ReportDocument.tsx")).not.toMatch(/ForensicBook/);
    expect(src("src/components/report/AuditReportDocument.tsx")).not.toMatch(/ForensicBook/);
    expect(src("src/components/report/ReportsWorkspace.tsx")).not.toMatch(/ForensicBook/);
    expect(src("src/app/reports/page.tsx")).not.toMatch(/ForensicBook/);
  });

  it("forensic-book is not an addable block", () => {
    expect(src("src/lib/report/blocks.ts")).toMatch(/Retired/);
    expect(src("src/lib/report/blocks.ts")).not.toMatch(/extras\.push\(\{[\s\S]*forensic-book/);
  });

  it("rendering ForensicBook throws", () => {
    expect(() => ForensicBook()).toThrow(/quarantined/);
  });
});
