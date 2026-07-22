import { emitNavBanner, subscribeNavBanner } from "../nav-banner";

it("delivers an emitted banner to subscribers and unsubscribes cleanly", () => {
  const seen: string[] = [];
  const off = subscribeNavBanner((b) => seen.push(b.label));
  emitNavBanner({ label: "Defect Analysis · April", reason: "rejection spike", fromHref: "/" });
  off();
  emitNavBanner({ label: "COPQ", reason: "x", fromHref: "/" });
  expect(seen).toEqual(["Defect Analysis · April"]);
});
