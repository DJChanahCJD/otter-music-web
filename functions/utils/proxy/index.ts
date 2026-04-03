// functions/utils/proxy/index.ts
import { safeFetch } from "./fetch";
import { filterResponseHeaders } from "./headers";

export * from "./headers";

/**
 * 统一代理 GET 请求入口
 * @param targetUrl 目标 URL
 * @param extraHeaders 额外的自定义请求头
 */
export async function proxyGet(
  targetUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const url = new URL(targetUrl);

  const response = await safeFetch(targetUrl, {
    ...extraHeaders,
  });

  return response;
}

/**
 * 处理流式响应的辅助函数（用于透传过滤后的响应）
 */
export function handleStreamResponse(response: Response): Response {
  const filteredHeaders = filterResponseHeaders(response.headers);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: filteredHeaders,
  });
}

/**
 * 获取通用代理 URL
 */
export function getProxyUrl(origin: string, targetUrl: string) {
  return `${origin}/proxy?url=${encodeURIComponent(targetUrl)}`;
}