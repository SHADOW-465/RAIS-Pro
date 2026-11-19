import { isClerkAuth } from "@/lib/auth/provider";
import { ClerkSignIn } from "../ClerkSignIn";
import { LegacyLoginForm } from "../LegacyLoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (isClerkAuth()) return <ClerkSignIn nextPath={next} />;
  return <LegacyLoginForm />;
}
