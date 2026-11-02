import { redirect } from "next/navigation";

// Calculation rules live inside /settings now (section 01), not on their own
// page — one less level of navigation for a plant that reached them from the
// settings rail anyway. The route stays as a redirect so existing links,
// bookmarks and the Ask MOID hand-off keep working.
export default function RulesRedirect() {
  redirect("/settings#rules");
}
