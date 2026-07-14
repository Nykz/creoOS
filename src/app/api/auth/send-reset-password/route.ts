import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();
    if (!email) return NextResponse.json({ message: "Email is required." }, { status: 400 });
    const client = createServerClient({ baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL, anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY, cookies: request.cookies });
    const { data, error } = await client.auth.sendResetPasswordEmail({ email, redirectTo: `${new URL(request.url).origin}/reset-password` });
    if (error) return NextResponse.json({ message: error.message }, { status: error.statusCode ?? 400 });
    return NextResponse.json({ message: data?.message ?? "Password reset instructions sent." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not send reset instructions." }, { status: 500 });
  }
}
