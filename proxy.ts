import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const requestCookies: Parameters<typeof updateSession>[0]["requestCookies"] = {
    get: request.cookies.get.bind(request.cookies),
  };

  await updateSession({
    requestCookies,
    responseCookies: response.cookies as Parameters<typeof updateSession>[0]["responseCookies"],
  });

  return response;
}
