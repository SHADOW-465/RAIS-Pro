import { NextRequest, NextResponse } from "next/server";
import { getDatasetStore } from "@/lib/dataset/get-store";
import { getRowStore } from "@/lib/dataset/get-row-store";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get("datasetId");
    if (datasetId) {
      const rows = await getRowStore().forDataset(datasetId);
      return NextResponse.json({ rows });
    }
    const store = getDatasetStore();
    const datasets = await store.list();
    return NextResponse.json({ datasets });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load datasets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const datasets = body?.datasets as Dataset[] | undefined;
    if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
      return NextResponse.json({ error: "No datasets provided." }, { status: 400 });
    }
    const invalid = datasets.find((d) => !d?.id || !d?.title || !Array.isArray(d?.sources));
    if (invalid) {
      return NextResponse.json({ error: "Malformed dataset: id, title, and sources are required." }, { status: 400 });
    }

    const rows = body?.rows as DatasetRow[] | undefined;
    if (rows !== undefined) {
      if (!Array.isArray(rows)) {
        return NextResponse.json({ error: "rows must be an array when provided." }, { status: 400 });
      }
      const invalidRow = rows.find(
        (r) => !r?.datasetId || !r?.fileName || !r?.sheetName ||
          r?.values === null || typeof r?.values !== "object" || Array.isArray(r?.values),
      );
      if (invalidRow) {
        return NextResponse.json({ error: "Malformed row: datasetId, fileName, sheetName, values are required." }, { status: 400 });
      }
    }

    const store = getDatasetStore();
    await store.upsert(datasets);

    if (rows && rows.length > 0) {
      await getRowStore().upsert(rows);
    }

    return NextResponse.json({ success: true, count: datasets.length, rowCount: rows?.length ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to persist datasets" }, { status: 500 });
  }
}
