import * as fs from "fs";
import * as path from "path";
import { datasetsFromWorkbooks } from "../from-workbooks";

const DIR = path.join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26");
const maybe = fs.existsSync(DIR) ? describe : describe.skip;

maybe("datasetsFromWorkbooks (real corpus)", () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /REJECTION ANALYSIS.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => ({ fileName: f, data: fs.readFileSync(path.join(DIR, f)) as unknown as ArrayBuffer }));

  it("collapses the 12 monthly files' many sheets into far fewer datasets", () => {
    const ds = datasetsFromWorkbooks(files);
    // Each file has ~5 sheets → dozens of sheets total, but only a handful of
    // distinct signatures (Cummulative / Visual / Balloon / Valve / Final).
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.length).toBeLessThan(files.length); // far fewer datasets than files
  });

  it("every dataset has a non-empty title and at least one source", () => {
    for (const d of datasetsFromWorkbooks(files)) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.sources.length).toBeGreaterThan(0);
    }
  });
});
