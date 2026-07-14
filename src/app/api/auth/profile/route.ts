import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";
import { isSameOrigin, jsonSecurityError } from "@/lib/security/request";

export const runtime = "nodejs";

function env(name: "NEXT_PUBLIC_INSFORGE_URL" | "NEXT_PUBLIC_INSFORGE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function client(request: NextRequest) {
  return createServerClient({ baseUrl: env("NEXT_PUBLIC_INSFORGE_URL"), anonKey: env("NEXT_PUBLIC_INSFORGE_ANON_KEY"), cookies: request.cookies });
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return jsonSecurityError();
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length < 2) return NextResponse.json({ message: "Enter a name with at least two characters." }, { status: 400 });
    const { data, error } = await client(request).auth.setProfile({ name, title: typeof body.title === "string" ? body.title.trim() : "", bio: typeof body.bio === "string" ? body.bio.trim() : "" });
    if (error) return NextResponse.json({ message: error.message }, { status: error.statusCode ?? 400 });
    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not update profile." }, { status: 500 });
  }
}
