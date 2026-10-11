import {
  getSummaryStats,
  getTopUrl,
  getUrlStats,
} from "../../../lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await getSummaryStats();
    const topUrl = await getTopUrl();
    const urls = await getUrlStats();

    // summary, topUrl, urls를 하나의 JSON 응답으로 반환
    return Response.json(
      {
        summary: {
          totalUrls: summary.totalUrls,
          totalClicks: summary.totalClicks,
          clickedUrls: summary.clickedUrls,
          topUrl: {
            shortCode: topUrl.shortCode,
            originalUrl: topUrl.originalUrl,
            clickCount: topUrl.clickCount,
          },
        },
        urls: urls.map((url) => ({
          shortCode: url.shortCode,
          originalUrl: url.originalUrl,
          clickCount: url.clickCount,
          createdAt: url.createdAt,
          lastClickedAt: url.lastClickedAt,
        }))
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );

  } catch (error) {
    console.error("Failed to load stats", error);

    return Response.json(
      {
        error: {
          code: "STATS_ERROR",
          message: "Failed to load stats.",
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
