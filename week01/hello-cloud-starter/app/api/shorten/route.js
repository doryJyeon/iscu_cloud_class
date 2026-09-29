import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { saveUrl } from "../../../lib/db";
import { validateUrl } from "../../../lib/validation";

export const runtime = "nodejs";

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/*
 * createShortCode()
 *
 * 원본 URL을 입력받아 SHA-256 해시를 생성하고,
 * 그 값을 이용해 6자리 short code를 만듭니다.
 */
function createShortCode(originalUrl, length = 6) {
  const hex = createHash("sha256")
    .update(originalUrl)
    .digest("hex");

  let code = "";

  for (let i = 0; i < length; i++) {
    const value = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );

    code += ALPHABET[value % ALPHABET.length];
  }

  return code;
}

/*
 * POST
 */
export async function POST(request) {
  try {

    /*
     * originalUrl 값 가져오기
     */
    const body = await request.json().catch(() => null);

    const raw = body?.originalUrl;
    const originalUrl =
      typeof raw === "string" ? raw.trim() : "";

    /*
     * 올바른 URL인지 검사
     * client 문제 status: 400 통일
     */
    const error = validateUrl(originalUrl);

    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }

    /*
     *  Short URL 생성
     */
    const shortCode = createShortCode(originalUrl);

    await saveUrl(shortCode, originalUrl);

    const baseUrl = new URL(request.url).origin;

    /*
     * URL 생성 성공
     */
    return NextResponse.json(
      {
        shortCode,
        shortUrl: `${baseUrl}/${shortCode}`,
        originalUrl,
      },
      { status: 201 }
    );

  } catch {
    /*
     * 서버 오류 발생
     */
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create short URL.",
        },
      },
      { status: 500 }
    );
  }
}
