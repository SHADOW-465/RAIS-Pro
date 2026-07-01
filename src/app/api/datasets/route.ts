import { NextRequest, NextResponse } from "next/server";
import { getDatasetStore } from "@/lib/dataset/get-store";
import type { Dataset } from "@/lib/dataset/types";

export async function GET() {
  try {
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
    const store = getDatasetStore();
    await store.upsert(datasets);
    return NextResponse.json({ success: true, count: datasets.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to persist datasets" }, { status: 500 });
  }
}
