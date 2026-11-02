import { notFound } from "next/navigation";
import Demo from "./Demo";

// Dev-only gallery of the shared UI components (redesign phase 2).
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Demo />;
}
