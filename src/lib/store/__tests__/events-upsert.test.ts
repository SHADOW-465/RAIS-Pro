import { EVENTS_UPSERT } from "../supabase";

test("an events upsert does not update a row that is already stored", () => {
  expect(EVENTS_UPSERT).toEqual({ onConflict: "event_id", ignoreDuplicates: true });
});
