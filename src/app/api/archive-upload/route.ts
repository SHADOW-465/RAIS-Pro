// src/app/api/archive-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

    // Local directory archiving
    const dir = path.join(process.cwd(), "Uploads", "Original");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const archivedName = `${hash}_${safeName}`;
    const destPath = path.join(dir, archivedName);

    // Save only if it does not exist (idempotent / read-only)
    if (!fs.existsSync(destPath)) {
      fs.writeFileSync(destPath, buffer);
      try {
        // Set file permissions to read-only (Windows/Unix compatible)
        fs.chmodSync(destPath, 0o444);
      } catch (err) {
        console.warn("Could not set file permissions to read-only:", err);
      }
    }

    // Save record of raw file to Supabase raw_files table
    const db = createServerClient();
    const { error: dbError } = await db.from("raw_files").upsert({
      file_hash: hash,
      file_name: file.name,
      file_bytes: buffer,
      recorded_at: new Date().toISOString()
    }, { onConflict: "file_hash" });

    if (dbError) {
      console.error("Failed to save file to Supabase raw_files:", dbError);
      throw dbError;
    }

    return NextResponse.json({
      success: true,
      fileHash: hash,
      fileName: file.name,
      filePath: `/Uploads/Original/${archivedName}`
    });
  } catch (err: any) {
    console.error("Failed to archive upload:", err);
    return NextResponse.json({ error: err?.message ?? "Archiving failed" }, { status: 500 });
  }
}
