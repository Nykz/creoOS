import { NextRequest, NextResponse } from "next/server";
import { createInsforgeAuthActions } from "@/lib/insforge/auth-actions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const auth = createInsforgeAuthActions(request, response);
  await auth.signOut();
  return response;
}
