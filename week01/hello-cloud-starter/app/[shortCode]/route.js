import { findUrlByShortCode } from "../../lib/db";
import { recordClick } from "../../lib/stats";

export async function GET(request, { params }) {
  const { shortCode } = await params;

  const originalUrl = await findUrlByShortCode(shortCode);

  // 404 Not Found의 경우 Location 없음
  if (!originalUrl) {
    console.warn("Short URL not found", { shortCode });

    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  // url이 존재하면 클릭 수를 기록
  try {
    await recordClick(shortCode);
  } catch (error) {
    console.error("Failed to record click", { shortCode });
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: originalUrl,
      "Cache-Control": "no-store",
    },
  });
}