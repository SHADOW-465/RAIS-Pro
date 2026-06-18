import { type Scope } from "./scope";
import { rejectionRate } from "./rejection";
import type { Event } from "@/lib/store/types";

export type QualityStatusT = "good" | "watch" | "at-risk";

function getTargetLimit(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("rais_settings_target_rejection");
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num / 100;
    }
  }
  return 0.10;
}

function getWatchLimit(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("rais_settings_watch_rejection");
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num / 100;
    }
  }
  return 0.05;
}

export function qualityStatus(events: Event[], scope: Scope): QualityStatusT {
  const rate = rejectionRate(events, scope).value;
  const targetLimit = getTargetLimit();
  const watchLimit = getWatchLimit();

  if (rate > targetLimit) {
    return "at-risk";
  } else if (rate > watchLimit) {
    return "watch";
  }
  return "good";
}
