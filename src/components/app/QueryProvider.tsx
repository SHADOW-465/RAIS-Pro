"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { bindQueryClient, createAppQueryClient } from "@/lib/client/query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const created = createAppQueryClient();
    bindQueryClient(created);
    return created;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
