import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

function requiredPublicEnv(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function createInsforgeAuthActions(request: NextRequest, response: NextResponse) {
  return createAuthActions({
    baseUrl: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_URL"),
    anonKey: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
    requestCookies: request.cookies,
    responseCookies: response.cookies,
    timeout: 60_000,
  });
}
