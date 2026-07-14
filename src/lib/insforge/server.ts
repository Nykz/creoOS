import "server-only";
import { createAdminClient } from "@insforge/sdk";
import { env } from "@/lib/env";

// This client is intentionally server-only. Admin credentials must never cross the API boundary.
export function getInsforgeAdmin() {
  return createAdminClient({
    baseUrl: env.insforgeUrl(),
    apiKey: env.insforgeApiKey(),
  });
}
