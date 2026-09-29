export function validateUrl(originalUrl) {
	const MAX_URL_LENGTH = 2048;

	// 입력된 URL 없음
	if (!originalUrl) {
		return {
			code: "MISSING_URL",
			message: "Original URL is required.",
		};
	}

	// URL MAX 길이 초과
	if (originalUrl.length > MAX_URL_LENGTH) {
		return {
			code: "URL_TOO_LONG",
			message: `URL must be ${MAX_URL_LENGTH} characters or fewer.`,
		};
	}

	// 올바른 URL 형식인지 검사
	let parsedUrl;

	try {
		parsedUrl = new URL(originalUrl);
	} catch {
		return {
			code: "INVALID_URL",
			message: "URL must start with http:// or https://.",
		};
	}

	// 프로토콜 검사 http | https
	if (!["http:", "https:"].includes(parsedUrl.protocol)) {
		return {
			code: "INVALID_URL",
			message: "URL must start with http:// or https://.",
		};
	}

	return null;
}