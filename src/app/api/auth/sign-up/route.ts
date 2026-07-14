import { NextRequest, NextResponse } from "next/server";
import { signUpSchema } from "@/lib/auth/validation";
import { createInsforgeAuthActions } from "@/lib/insforge/auth-actions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a valid name, email, and password." }, { status: 400 });
  }

  const response = NextResponse.json({ user: null });
  const auth = createInsforgeAuthActions(request, response);
  const { data, error } = await auth.signUp(parsed.data);

  if (error || !data?.user) {
    return NextResponse.json(
      { message: error?.message ?? "Signup failed. Please try again." },
      { status: error?.statusCode ?? 401 },
    );
  }

  const success = NextResponse.json(
    {
      user: data.user,
      requireEmailVerification: data.requireEmailVerification ?? false,
    },
  );
  response.cookies.getAll().forEach((cookie) => success.cookies.set(cookie));
  return success;
}
