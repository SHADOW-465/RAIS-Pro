import { type Scope, scopeEvents, periodKey, periodLabel, periodsIn } from "./scope";
import type { SeriesPoint } from "./rejection";
import type { Event } from "@/lib/store/types";

export function sizeTrend(events: Event[], scope: Scope, size: string): SeriesPoint[] {
  const allEvents = scopeEvents(events, scope);
  const ev = allEvents.filter((e) => "size" in e && (e as any).size === size);
  const periods = periodsIn(allEvents, scope.grain);
  return periods.map((p) => {
    const bucket = ev.filter((e) => periodKey(e.occurredOn.start, scope.grain) === p);
    let checked = 0;
    let rejected = 0;
    for (const e of bucket) {
      if (e.eventType === "production") checked += (e as any).quantity;
      else if (e.eventType === "inspection" && (e as any).disposition === "rejected") rejected += (e as any).quantity;
    }
    return {
      period: p,
      label: periodLabel(p),
      value: checked > 0 ? rejected / checked : 0,
    };
  });
}
