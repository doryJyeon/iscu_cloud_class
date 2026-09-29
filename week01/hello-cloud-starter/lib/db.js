import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// originalUrl 중복 조회
export async function getUrlByOriginalUrl(originalUrl) {
  const result = await sql`
    SELECT short_code, original_url
    FROM urls
    WHERE original_url = ${originalUrl}
  `;

  return result[0];
}

// shortCode 중복 조회
export async function getUrlByShortCode(shortCode) {
  const result = await sql`
    SELECT short_code, original_url
    FROM urls
    WHERE short_code = ${shortCode}
  `;

  return result[0];
}

export async function saveUrl(shortCode, originalUrl) {
  await sql`
    INSERT INTO urls (short_code, original_url)
    VALUES (${shortCode}, ${originalUrl})
  `;
}
