// Client-side gate for Data Schema edits. This is friction, not auth —
// the catalog API stays the same. Default view is locked so a deployment
// cannot be casually re-pointed at a different plant.

export const SCHEMA_EDIT_PASSWORD = "editonly";

export function checkSchemaEditPassword(input: string): boolean {
  return input === SCHEMA_EDIT_PASSWORD;
}
