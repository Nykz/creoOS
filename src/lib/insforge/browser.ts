"use client";

import { createClient } from "@insforge/sdk";

function requiredPublicEnv(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export const insforge = createClient({
  baseUrl: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_URL"),
  anonKey: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
});

export function getBrowserAccessToken() {
  return insforge.auth.getAccessToken();
}
