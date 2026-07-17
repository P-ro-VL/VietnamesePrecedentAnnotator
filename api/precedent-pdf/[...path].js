const PDF_BASE_URL = "https://anle.toaan.gov.vn";

const getPath = (value) => {
  if (Array.isArray(value)) return value.join("/");
  return value || "";
};

export default async function handler(request, response) {
  const path = getPath(request.query.path);
  const target = new URL(`/${path}`, PDF_BASE_URL);

  for (const [key, value] of Object.entries(request.query)) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => target.searchParams.append(key, item));
    } else if (value !== undefined) {
      target.searchParams.set(key, value);
    }
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "curl/8.7.1",
        Accept: "application/pdf,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      }
    });
    const body = await upstream.arrayBuffer();

    response.status(upstream.status);
    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/pdf"
    );
    response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    response.send(Buffer.from(body));
  } catch (error) {
    response.status(502).json({
      error: "Bad Gateway",
      message: error instanceof Error ? error.message : "Cannot fetch upstream PDF"
    });
  }
}
