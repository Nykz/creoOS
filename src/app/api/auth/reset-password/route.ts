import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    if (!body.token || !body.password || body.password.length < 10) return NextResponse.json({ message: "Use a reset link and a password with at least 10 characters." }, { status: 400 });
    const client = createServerClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL, anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY, cookies: request.cookies });
    const { data, error } = await client.auth.resetPassword({ otp: body.token, newPassword: body.password });
    if (error) return NextResponse.json({ message: error.message }, { status: error.statusCode ?? 400 });
    return NextResponse.json({ message: data?.message ?? "Password updated." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not update password." }, { status: 500 });
  }
}
