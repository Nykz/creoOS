import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";

export const runtime = "nodejs";

function requiredPublicEnv(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function GET(request: NextRequest) {
  const client = createServerClient({
    baseUrl: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_URL"),
    anonKey: requiredPublicEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
    cookies: request.cookies,
  });

  const { data, error } = await client.auth.getCurrentUser();
  if (error) {
    return NextResponse.json(
      { user: null, message: error.message },
      { status: error.statusCode ?? 401 },
    );
  }

  return NextResponse.json({ user: data.user ?? null });
}
