import { findUrlByShortCode } from "../../lib/db";

export async function GET(request, { params }) {
  const { shortCode } = await params;

  const originalUrl = await findUrlByShortCode(shortCode);

  // 404 Not Found의 경우 Location 없음
  if (!originalUrl) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: originalUrl,
      "Cache-Control": "no-store",
    },
  });
}