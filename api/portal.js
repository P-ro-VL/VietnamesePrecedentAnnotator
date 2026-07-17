import { readFile } from "node:fs/promises";
import path from "node:path";
import { proxyGet, sendProxyError, setProxyHeaders } from "../server/proxy.js";

const PORTAL_ORIGIN = "https://anle.toaan.gov.vn";
const CACHE_PAGE_COUNT = 5;

const firstValue = (value) => (Array.isArray(value) ? value[0] : value);

const readCachedPage = async (selectedPage) => {
  const page = Number(selectedPage);

  if (!Number.isInteger(page) || page < 1 || page > CACHE_PAGE_COUNT) {
    return Buffer.alloc(0);
  }

  try {
    return await readFile(
      path.join(process.cwd(), "public", "precedent-cache", `page-${page}.html`)
    );
  } catch {
    return Buffer.alloc(0);
  }
};

export default async function handler(request, response) {
  const path = firstValue(request.query.path) || "/anle/anle";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
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
        "User-Agent": "curl/8.7.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Connection: "close",
        Host: "anle.toaan.gov.vn",
        Referer: "https://anle.toaan.gov.vn/webcenter/portal/anle/anle"
      },
      { attempts: 4, timeoutMs: 10000 }
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
