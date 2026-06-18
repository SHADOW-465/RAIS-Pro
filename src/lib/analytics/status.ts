import { type Scope } from "./scope";
import { rejectionRate } from "./rejection";
import type { Event } from "@/lib/store/types";

export type QualityState = "ok" | "watch" | "at-risk";
export interface QualityStatusT {
  state: QualityState;
  reason: string;
}

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
  const pct = (rate * 100).toFixed(2);

  if (rate > targetLimit) {
    return {
      state: "at-risk",
      reason: `Rejection rate ${pct}% exceeds the ${(targetLimit * 100).toFixed(1)}% target — needs immediate attention.`,
    };
  } else if (rate > watchLimit) {
    return {
      state: "watch",
      reason: `Rejection rate ${pct}% is above the ${(watchLimit * 100).toFixed(1)}% watch threshold — monitor closely.`,
    };
  }
  return { state: "ok", reason: `Rejection rate ${pct}% is within target.` };
}
