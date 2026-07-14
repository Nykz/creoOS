export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function jsonSecurityError() {
  return Response.json({ message: "Cross-origin requests are not allowed." }, { status: 403 });
}
