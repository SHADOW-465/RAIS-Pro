// src/app/api/archive-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Returns a writable archive directory.
 *
 * Vercel serverless containers have a read-only filesystem at /var/task
 * (process.cwd()). Only /tmp is writable at runtime in that environment.
 * In local development process.cwd() works fine, so we try that first
 * and fall back to /tmp when it is not writable.
 */
function resolveArchiveDir(): string {
  // Primary: project-relative path (works in local dev / self-hosted)
  const local = path.join(process.cwd(), "Uploads", "Original");
  try {
    fs.mkdirSync(local, { recursive: true });
    // Quick write-access probe
    fs.accessSync(local, fs.constants.W_OK);
    return local;
  } catch {
    // Fallback: /tmp is always writable in Vercel serverless
    const tmp = path.join("/tmp", "rais-uploads", "Original");
    fs.mkdirSync(tmp, { recursive: true });
    return tmp;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute cryptographic SHA-256 hash
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // ── Local disk archive (best-effort) ────────────────────────────────────
    // Supabase raw_files is the durable, authoritative archive.
    // The local copy is a convenience; we never hard-fail if it can't be written.
    let archivedLocalPath: string | null = null;
    try {
      const dir = resolveArchiveDir();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const archivedName = `${hash}_${safeName}`;
      const destPath = path.join(dir, archivedName);

      if (!fs.existsSync(destPath)) {
        fs.writeFileSync(destPath, buffer);
        try {
          fs.chmodSync(destPath, 0o444);
        } catch {
          // chmod may be unsupported on some platforms — not critical
        }
      }
      archivedLocalPath = destPath;
    } catch (localErr) {
      // Log but do NOT propagate — Supabase is the source of truth
      console.warn(
        "[archive-upload] Local disk write skipped (read-only fs?):",
        (localErr as Error).message
      );
    }

    // ── Supabase durable archive (authoritative) ─────────────────────────────
    // file_bytes must go over the wire as a Postgres bytea hex literal
    // ("\x<hex>"), NOT a raw Buffer — supabase-js JSON-serializes the request
    // body, and Node's Buffer.toJSON() silently turns a bare Buffer into
    // {"type":"Buffer","data":[...]}, which Postgres then stores as the
    // literal TEXT of that JSON descriptor, not the real file bytes. Every
    // read of raw_files.file_bytes (e.g. /api/raw-file, for Verify Mode)
    // would come back corrupted without this.
    const db = createServerClient();
    const { error: dbError } = await db.from("raw_files").upsert(
      {
        file_hash: hash,
        file_name: file.name,
        file_bytes: `\\x${buffer.toString("hex")}`,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "file_hash" }
    );

    if (dbError) {
      console.error("Failed to save file to Supabase raw_files:", dbError);
      throw dbError;
    }

    return NextResponse.json({
      success: true,
      fileHash: hash,
      fileName: file.name,
      // Return the local path if available, otherwise indicate Supabase-only storage
      filePath: archivedLocalPath ?? `supabase://raw_files/${hash}`,
    });
  } catch (err: any) {
    console.error("Failed to archive upload:", err);
    return NextResponse.json(
      { error: err?.message ?? "Archiving failed" },
      { status: 500 }
    );
  }
}
