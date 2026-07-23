import { readFile } from "node:fs/promises";
import path from "node:path";
import { proxyGet, sendProxyError, setProxyHeaders } from "../server/proxy.js";

const PORTAL_ORIGIN = "https://anle.toaan.gov.vn";
const CACHE_PAGE_COUNT = 5;

const getPathString = (value) => {
  if (Array.isArray(value)) return value.join("/");
  return value ? String(value) : "";
};

const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

const readCachedPage = async (selectedPage) => {
  const page = Number(selectedPage);

  if (!Number.isInteger(page) || page < 1 || page > CACHE_PAGE_COUNT) {
    return Buffer.alloc(0);
  }

  const possiblePaths = [
    path.join(process.cwd(), "public", "precedent-cache", `page-${page}.html`),
    path.join(process.cwd(), "precedent-cache", `page-${page}.html`)
  ];

  for (const filePath of possiblePaths) {
    try {
      const data = await readFile(filePath);
      if (data.length) return data;
    } catch {
      // try next path
    }
  }

  return Buffer.alloc(0);
};

export default async function handler(request, response) {
  const rawPath = getPathString(request.query.path) || "/anle/anle";
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const target = new URL(`/webcenter/portal${normalizedPath}`, PORTAL_ORIGIN);

  for (const [key, value] of Object.entries(request.query)) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => target.searchParams.append(key, item));
    } else if (value !== undefined) {
      target.searchParams.set(key, value);
    }
  }

  try {
    const result = await proxyGet(
      target,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        Host: "anle.toaan.gov.vn",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      },
      { attempts: 2, timeoutMs: 7000 }
    );

    setProxyHeaders(
      response,
      result,
      "text/html; charset=utf-8",
      "s-maxage=300, stale-while-revalidate=3600"
    );
    response.send(result.body);
  } catch (error) {
    const cachedPage = await readCachedPage(firstValue(request.query.selectedPage) || "1");
    const selectedPage = Number(firstValue(request.query.selectedPage) || "1");

    if (cachedPage.length || selectedPage > CACHE_PAGE_COUNT) {
      response.status(200);
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
      response.setHeader("X-Proxy-Fallback", "static-cache");
      response.send(cachedPage);
      return;
    }

    sendProxyError(response, error, target);
  }
}
