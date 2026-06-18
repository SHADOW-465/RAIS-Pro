// Split an array into fixed-size batches. Used to keep Supabase/PostgREST
// requests under URL-length and payload-size limits (large .in() filters and
// bulk inserts otherwise fail with "Bad Request" / "fetch failed").
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
