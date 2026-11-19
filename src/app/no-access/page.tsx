import { isClerkAuth } from "@/lib/auth/provider";
import { NoAccessView } from "./NoAccessView";

export const dynamic = "force-dynamic";

export default function NoAccessPage() {
  return <NoAccessView clerk={isClerkAuth()} />;
}
