"use client";

// Replaces the root layout when it fails, so it must bring its own <html>.
import { ErrorScreen } from "@/components/app/ErrorScreen";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
