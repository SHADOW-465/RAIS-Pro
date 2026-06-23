import * as xlsx from "xlsx";
import { extractSchemaFromWorkbook, classifyWithSchema } from "@/lib/ingest/schema-extractor";
import type { RawSheet } from "@/types/dashboard";

describe("Dynamic Schema Extractor & Classifier", () => {
  test("extracts correct stages, roles, defects, and translates cell formulas", () => {
    // 1. Build a mock worksheet with multi-row headers and a cell formula
    const aoa = [
      ["DATE", "REC. QTY", "ACCEPT QTY", "HOLD QTY", "REJ. QTY", "REJ %", "REASON FOR REJECTION", "", ""],
      ["", "", "", "", "", "", 1, 2, 3],
      ["", "", "", "", "", "", "COAG", "SD", "TT"],
      [45748, 10000, 9500, 100, 400, 4.0, 300, 100, 0]
    ];

    const ws = xlsx.utils.aoa_to_sheet(aoa);
    
    // Add formula cell info to REJ % column (column F is index 5, row 4 is index 3)
    ws["F4"] = { t: "n", v: 4.0, f: "E4/B4*100" };

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Visual Inspection");

    // 2. Extract schema
    const schema = extractSchemaFromWorkbook(wb, "visual_report_2025.xlsx");

    expect(schema.fileName).toBe("visual_report_2025.xlsx");
    expect(schema.stages.length).toBe(1);

    const stage = schema.stages[0];
    expect(stage.label).toBe("Visual Inspection");
    // Resolves to the real registry stage (not slugify("Visual Inspection")),
    // so all visual sheets land on one 'visual' stage instead of bogus per-sheet ids.
    expect(stage.stageId).toBe("visual");

    // Verify field role classifications
    const dateField = stage.fields.find(f => f.name === "DATE");
    const checkedField = stage.fields.find(f => f.name === "REC. QTY");
    const goodField = stage.fields.find(f => f.name === "ACCEPT QTY");
    const reworkField = stage.fields.find(f => f.name === "HOLD QTY");
    const rejectedField = stage.fields.find(f => f.name === "REJ. QTY");
    const pctField = stage.fields.find(f => f.name === "REJ %");
    const coagField = stage.fields.find(f => f.name === "COAG");
    const sdField = stage.fields.find(f => f.name === "SD");

    expect(dateField?.role).toBe("date");
    expect(checkedField?.role).toBe("checked");
    expect(goodField?.role).toBe("good");
    expect(reworkField?.role).toBe("rework");
    expect(rejectedField?.role).toBe("rejected");
    expect(pctField?.role).toBe("formula");
    expect(coagField?.role).toBe("defect");
    expect(sdField?.role).toBe("defect");

    // Verify formula translation: cell references (E4, B4) converted to column names ([REJ. QTY], [REC. QTY])
    expect(pctField?.formula).toBe("[REJ. QTY]/[REC. QTY]*100");

    // 3. Classify raw rows using extracted schema
    const rawSheet: RawSheet = {
      name: "Visual Inspection",
      fileName: "visual_report_2025.xlsx",
      columns: ["DATE", "REC. QTY", "ACCEPT QTY", "HOLD QTY", "REJ. QTY", "REJ %", "COAG", "SD", "TT"],
      colLetters: {
        "DATE": "A",
        "REC. QTY": "B",
        "ACCEPT QTY": "C",
        "HOLD QTY": "D",
        "REJ. QTY": "E",
        "REJ %": "F",
        "COAG": "G",
        "SD": "H",
        "TT": "I"
      },
      rows: [
        {
          "DATE": 45748,
          "REC. QTY": 10000,
          "ACCEPT QTY": 9500,
          "HOLD QTY": 100,
          "REJ. QTY": 400,
          "REJ %": 4.0,
          "COAG": 300,
          "SD": 100,
          "TT": 0,
          "__rowNum": 4
        }
      ]
    };

    const records = classifyWithSchema([rawSheet], schema, "ingest-test-uuid");

    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.occurredOn.start).toBe("2025-04-01");
    expect(rec.stageId).toBe("visual");
    
    // Core quantities
    expect(rec.checked?.value).toBe(10000);
    expect(rec.checked?.cell).toBe("Visual Inspection!B4");
    expect(rec.rejected?.value).toBe(400);
    expect(rec.rejected?.cell).toBe("Visual Inspection!E4");

    // Defects mapped properly
    expect(rec.defects.length).toBe(2);
    const coagVal = rec.defects.find(d => d.raw === "COAG");
    const sdVal = rec.defects.find(d => d.raw === "SD");
    
    expect(coagVal?.value).toBe(300);
    expect(coagVal?.cell).toBe("Visual Inspection!G4");
    expect(sdVal?.value).toBe(100);
    expect(sdVal?.cell).toBe("Visual Inspection!H4");
  });
});
