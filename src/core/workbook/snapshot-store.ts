// src/core/workbook/snapshot-store.ts
// Persistence for lossless workbook snapshots (workbook_snapshots table).
// Same dual-adapter + process-singleton discipline as src/lib/store.

import type { WorkbookSnapshotT } from "@/shared/models/workbook";
import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

export interface SnapshotStore {
  /** Idempotent: content-addressed, so re-uploading identical bytes is a no-op. */
  put(snapshot: WorkbookSnapshotT): Promise<void>;
  get(snapshotId: string): Promise<WorkbookSnapshotT | null>;
  list(): Promise<{ snapshotId: string; fileName: string; uploadedAt: string }[]>;
  delete(snapshotId: string): Promise<void>;
}

class MemorySnapshotStore implements SnapshotStore {
  private byId = new Map<string, { snap: WorkbookSnapshotT; uploadedAt: string }>();
  async put(snapshot: WorkbookSnapshotT) {
    if (!this.byId.has(snapshot.snapshotId)) {
      this.byId.set(snapshot.snapshotId, { snap: snapshot, uploadedAt: new Date().toISOString() });
    }
  }
  async get(snapshotId: string) {
    return this.byId.get(snapshotId)?.snap ?? null;
  }
  async list() {
    return [...this.byId.values()]
      .map(({ snap, uploadedAt }) => ({ snapshotId: snap.snapshotId, fileName: snap.fileName, uploadedAt }))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }
  async delete(snapshotId: string) {
    this.byId.delete(snapshotId);
  }
}

class SupabaseSnapshotStore implements SnapshotStore {
  private db() { return createServerClient(); }
  async put(snapshot: WorkbookSnapshotT) {
    const { error } = await this.db().from("workbook_snapshots").upsert({
      snapshot_id: snapshot.snapshotId,
      file_name: snapshot.fileName,
      content: { sheets: snapshot.sheets },
    }, { onConflict: "snapshot_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  async get(snapshotId: string) {
    const { data, error } = await this.db().from("workbook_snapshots")
      .select("snapshot_id, file_name, content").eq("snapshot_id", snapshotId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { snapshotId: data.snapshot_id, fileName: data.file_name, sheets: data.content.sheets };
  }
  async list() {
    const { data, error } = await this.db().from("workbook_snapshots")
      .select("snapshot_id, file_name, uploaded_at").order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({ snapshotId: r.snapshot_id, fileName: r.file_name, uploadedAt: r.uploaded_at }));
  }
  async delete(snapshotId: string) {
    const { error } = await this.db().from("workbook_snapshots").delete().eq("snapshot_id", snapshotId);
    if (error) throw error;
  }
}

const g = globalThis as unknown as { __modSnapshotStore?: SnapshotStore };
export function getSnapshotStore(): SnapshotStore {
  if (!g.__modSnapshotStore) {
    g.__modSnapshotStore = shouldUseSupabase() ? new SupabaseSnapshotStore() : new MemorySnapshotStore();
  }
  return g.__modSnapshotStore;
}
