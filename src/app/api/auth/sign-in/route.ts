import { NextRequest, NextResponse } from "next/server";
import { createServerClient, setAuthCookies } from "@insforge/sdk/ssr";
import { signInSchema } from "@/lib/auth/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a valid email and password." }, { status: 400 });
  }

  const client = createServerClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
  });
  const { data, error } = await client.auth.signInWithPassword(parsed.data);

  if (error || !data?.user) {
    return NextResponse.json(
      { message: error?.message ?? "Sign in failed. Please check your credentials." },
      { status: error?.statusCode ?? 401 },
    );
  }

  const success = NextResponse.json({ user: data.user }, { headers: { "Cache-Control": "no-store" } });
  setAuthCookies(success.cookies, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return success;
}
