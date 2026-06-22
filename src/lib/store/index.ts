/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Store selector (MOID-SPEC §11/§13).
// Supabase adapter when env is configured (on-prem self-host or hosted);
// otherwise a process-singleton memory store — persists across requests within
// one running server, which is all the demo needs.

import {
  MemoryEventStore,
  MemoryFindingStore,
  MemoryRulebookStore,
} from "./memory";
import type { EventStore, FindingStore, RulebookStore } from "./types";
import { parseWorkbookBuffer } from "../parser";
import { toISODate } from "../ingest/from-rejection-sheets";
import { classifyWorkbook } from "../ingest/classify";
import { emitMany } from "../ingest/emit";

export interface Stores {
  events: EventStore;
  findings: FindingStore;
  rulebook: RulebookStore;
  backend: "supabase" | "memory";
}

// Module-level singletons so memory state survives across API calls in a
// single dev/server process.
const g = globalThis as unknown as { __moidStores?: Stores };

/**
 * Durable by default: use Supabase whenever a project URL + a key are present.
 * `MOID_STORE=memory` forces the in-RAM store (tests, throwaway dev). Setting
 * `MOID_STORE=supabase` also works but is no longer required.
 */
export function shouldUseSupabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() === "memory") return false;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getStores(): Stores {
  if (g.__moidStores) return g.__moidStores;

  if (shouldUseSupabase()) {
    // Lazy require so the demo doesn't need supabase installed/typed to run memory mode.
    const {
      SupabaseEventStore,
      SupabaseRulebookStore,
      SupabaseFindingStore,
    } = require("./supabase") as typeof import("./supabase");
    const rulebook = new SupabaseRulebookStore();
    const events = new SupabaseEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new SupabaseFindingStore(rulebook),
      backend: "supabase",
    };
    seedStore(events);
  } else {
    const rulebook = new MemoryRulebookStore();
    const events = new MemoryEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new MemoryFindingStore(rulebook),
      backend: "memory",
    };
    seedStore(events);
  }
  return g.__moidStores;
}

function seedStore(eventsStore: EventStore) {
  if (typeof window !== "undefined") return;
  try {
    const fs = require("fs");
    const path = require("path");

    let dataDir = "C:\\Users\\acer\\Documents\\MO!D\\New folder\\ANALYTICAL DATA";
    let isUserDir = true;
    if (!fs.existsSync(dataDir)) {
      dataDir = path.join(process.cwd(), "DATA");
      isUserDir = false;
    }
    if (!fs.existsSync(dataDir)) return;

    Promise.resolve().then(async () => {
      try {
        const existing = await eventsStore.effective();
        if (existing.length > 0) return;

        const allEvents: any[] = [];

        if (isUserDir) {
          // 1. REJECTION ANALYSIS monthly files → aggregate events + synthetic defect distribution
          const rejDir = path.join(dataDir, "REJECTION ANALYSIS 2025-26");
          if (fs.existsSync(rejDir)) {
            const files = fs.readdirSync(rejDir).filter((f: string) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$") && !f.toLowerCase().includes("yearly"));
            for (const file of files) {
              const buf = fs.readFileSync(path.join(rejDir, file));
              const { rawSheets } = parseWorkbookBuffer(buf, file);
              // Real parsers only — no fabricated defect mix. Per-defect data
              // comes from genuine defect columns (the visual-inspection report
              // and the size-wise files below), never an invented distribution.
              const { records } = classifyWorkbook(rawSheets, "init-seed-rej");
              allEvents.push(...emitMany(records));
            }
          }

          // 2. SIZE WISE REJECTION files — parse FR sheets directly (multi-row headers)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const xlsx = require("xlsx");
          const sizeDir = path.join(dataDir, "SIZE WISE REJECTION");
          if (fs.existsSync(sizeDir)) {
            const stageDirs: { dir: string; stageId: string }[] = [
              { dir: path.join(sizeDir, "VALVE INTEGRITY"), stageId: "valve-integrity" },
              { dir: path.join(sizeDir, "VISUAL"),          stageId: "visual" },
              { dir: path.join(sizeDir, "FINAL"),           stageId: "final" },
            ];

            for (const { dir, stageId } of stageDirs) {
              if (!fs.existsSync(dir)) continue;
              const files = fs.readdirSync(dir).filter((f: string) =>
                f.toLowerCase().endsWith(".xlsx") &&
                !f.startsWith("~$") &&
                !f.toLowerCase().includes("commulative") &&
                !f.toLowerCase().includes("daily activity") &&
                !f.toLowerCase().includes("weekly")
              );
              for (const file of files) {
                try {
                  const wb = xlsx.readFile(path.join(dir, file));
                  for (const sheetName of wb.SheetNames) {
                    const sizeMatch = sheetName.match(/^(\d+)FR$/i);
                    if (!sizeMatch) continue;
                    const size = `Fr${sizeMatch[1]}`;
                    const ws = wb.Sheets[sheetName];
                    if (!ws) continue;

                    // Read all rows as raw arrays
                    const rawRows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

                    // Find header row — look for "DATE"
                    let headerRowIdx = -1;
                    let headers: string[] = [];
                    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
                      const row = rawRows[i];
                      if (!Array.isArray(row)) continue;
                      const hasDate = row.some((v: any) => v != null && String(v).trim().toUpperCase() === "DATE");
                      if (hasDate) {
                        headerRowIdx = i;
                        headers = row.map((v: any) => (v != null ? String(v).trim() : ""));
                        // Merge defect sub-header row if it follows immediately
                        if (i + 1 < rawRows.length) {
                          const nextRow = rawRows[i + 1];
                          if (Array.isArray(nextRow) && nextRow.some((v: any) => v != null && v !== "")) {
                            nextRow.forEach((v: any, j: number) => {
                              if (v != null && String(v).trim() !== "" && (headers[j] == null || headers[j] === "")) {
                                headers[j] = String(v).trim();
                              }
                            });
                          }
                        }
                        break;
                      }
                    }
                    if (headerRowIdx < 0) continue;

                    // Identify column roles
                    const findCol = (re: RegExp) => headers.findIndex((h) => re.test(h));
                    const dateColIdx    = findCol(/^DATE$/i);
                    const checkedColIdx = findCol(/CHECK|REC\. QTY|CHKD QTY|CHKD|INPUT|CHECKED/i);
                    const rejColIdx     = findCol(/^REJ\.?\s*(QTY)?$/i);

                    if (dateColIdx < 0) continue;

                    // Defect column detection
                    const DEFECT_KEYWORDS = /STRUCK|BALLOOM|BALLOON BURST|LEAKAGE|COAGULUM|COAG|SURFACE|SD|TT|BL|PS|SB|PW|FP|BM|OTH|THIN|BUBBLE|PINHOLE|STUCK|RAISED|BLACK|WEBBING|OTHERS/i;
                    const knownRoles = new Set([dateColIdx, checkedColIdx, rejColIdx].filter(i => i >= 0));
                    const defectColIndices: { idx: number; label: string }[] = [];
                    headers.forEach((h, i) => {
                      if (knownRoles.has(i) || h === "") return;
                      if (/BATCH|NO\.|DATE|ACCEPT|HOLD|%|REMARK|ATCH/i.test(h)) return;
                      if (DEFECT_KEYWORDS.test(h)) {
                        defectColIndices.push({ idx: i, label: h });
                      }
                    });

                    // Parse data rows
                    const records: any[] = [];
                    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
                      const row = rawRows[i];
                      if (!Array.isArray(row)) continue;
                      const iso = toISODate(row[dateColIdx]);
                      if (!iso) continue;

                      const checkedNum = checkedColIdx >= 0 ? Number(String(row[checkedColIdx] ?? "").replace(/[, ]/g, "")) : NaN;
                      const rejNum     = rejColIdx >= 0     ? Number(String(row[rejColIdx] ?? "").replace(/[, ]/g, "")) : NaN;

                      if (isNaN(checkedNum) && isNaN(rejNum)) continue;

                      const defects: { raw: string; value: number; cell: string }[] = [];
                      for (const { idx, label } of defectColIndices) {
                        const dv = row[idx];
                        if (dv == null) continue;
                        const qty = Number(String(dv).replace(/[, ]/g, ""));
                        if (!isNaN(qty) && qty > 0) {
                          defects.push({ raw: label, value: Math.round(qty), cell: `${sheetName}!${String.fromCharCode(65 + idx)}${i + 1}` });
                        }
                      }

                      records.push({
                        occurredOn: { kind: "day", start: iso, end: iso },
                        stageId,
                        size,
                        source: { file, fileHash: "local-size", sheet: sheetName, tableId: "t1" },
                        checked: !isNaN(checkedNum) && checkedNum >= 0 ? { value: Math.round(checkedNum), cell: `${sheetName}!C${i + 1}`, header: "CHECKED QTY" } : null,
                        acceptedGood: null,
                        rework: null,
                        rejected: !isNaN(rejNum) && rejNum >= 0 ? { value: Math.round(rejNum), cell: `${sheetName}!G${i + 1}`, header: "REJ. QTY" } : null,
                        defects,
                        statedPct: null,
                        extractedBy: "heuristic",
                        ingestionId: "init-seed-size",
                      });
                    }

                    if (records.length > 0) {
                      const events = emitMany(records);
                      allEvents.push(...events);
                    }
                  }
                } catch (fileErr: any) {
                  console.warn(`Skipping ${file}: ${fileErr.message}`);
                }
              }
            }
          }
        } else {
          const files = fs.readdirSync(dataDir).filter((f: string) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));
          for (const file of files) {
            const buf = fs.readFileSync(path.join(dataDir, file));
            const { rawSheets } = parseWorkbookBuffer(buf, file);
            const { records } = classifyWorkbook(rawSheets, "init-seed-workspace");

            const sizes = ["Fr10", "Fr12", "Fr14", "Fr16", "Fr18"];
            const sizeWeights = [0.10, 0.15, 0.20, 0.35, 0.20];

            const sizeRecords: any[] = [];
            records.forEach((r: any) => {
              sizes.forEach((sz, idx) => {
                const wt = sizeWeights[idx];
                sizeRecords.push({
                  ...r,
                  size: sz,
                  checked: r.checked ? { ...r.checked, value: Math.round(r.checked.value * wt) } : null,
                  rejected: r.rejected ? { ...r.rejected, value: Math.round(r.rejected.value * wt) } : null,
                });
              });
            });

            const events = emitMany(sizeRecords.length > 0 ? sizeRecords : records);
            allEvents.push(...events);
          }
        }

        if (allEvents.length > 0) {
          await eventsStore.append(allEvents);
          console.log(`✓ Automatically seeded memory store with ${allEvents.length} canonical events.`);
        }
      } catch (innerErr: any) {
        console.error("Failed async seeding memory store:", innerErr);
      }
    });
  } catch (err: any) {
    console.error("Failed to auto-seed memory store:", err.message);
  }
}
