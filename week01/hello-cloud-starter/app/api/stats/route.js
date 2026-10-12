import {
  getSummaryStats,
  getTopUrl,
  getUrlStats,
} from "../../../lib/stats";
import { authenticate } from "../../../lib/auth";
import { authorize } from "../../../lib/authorization";

export const dynamic = "force-dynamic";

function authenticationRequiredResponse() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin"',
      "Cache-Control": "no-store",
    },
  });
}

function forbiddenResponse() {
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request) {
  const user = authenticate(request);
  if (!user) return authenticationRequiredResponse();
  if (!authorize(user, "stats:read")) return forbiddenResponse();

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
