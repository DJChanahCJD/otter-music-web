import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { proxyGet, handleStreamResponse } from '@utils/proxy';
import type { Env } from '../types/hono';
import { fail } from '@utils/response';

export const proxyRoutes = new Hono<{ Bindings: Env }>();

const proxySchema = z.object({
  url: z.string().url(),
  headers: z.string().optional(),
  filename: z.string().optional(),
});

const handleProxyRequest = async (c: any) => {
  const { url: targetUrl, headers: headersParam, filename } = c.req.valid('query');
  let customHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: '',
  };

  if (headersParam) {
    try {
      const parsed = JSON.parse(headersParam);
      customHeaders = { ...customHeaders, ...parsed };
    } catch {
      // Ignore invalid headers
    }
  }

  // Forward Range header for audio seeking support
  const range = c.req.header('range');
  if (range) {
    customHeaders['range'] = range;
  }

  try {
    const response = await proxyGet(targetUrl, customHeaders);
    const streamResponse = handleStreamResponse(response);
    const newHeaders = new Headers(streamResponse.headers);

    if (filename) {
      const encodedFilename = encodeURIComponent(filename);
      newHeaders.set(
        'Content-Disposition',
        `attachment; filename="${filename.replace(/"/g, '"')}"; filename*=UTF-8''${encodedFilename}`
      );
    }

    const origin = c.req.header('origin');
    if (origin && origin !== 'null') {
      newHeaders.set('Access-Control-Allow-Origin', origin);
      newHeaders.set('Access-Control-Allow-Credentials', 'true');
      newHeaders.set('Vary', 'Origin');
    } else {
      newHeaders.set('Access-Control-Allow-Origin', '*');
    }
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    return new Response(streamResponse.body, {
      status: streamResponse.status,
      statusText: streamResponse.statusText,
      headers: newHeaders,
    });
  } catch (e: any) {
    console.error("Proxy error:", e);
    return fail(c, `Proxy error: ${e.message || "Unknown error"}`, 500);
  }
};

// 解析 Range 头的辅助函数
const parseRange = (range: string, totalSize: number) => {
  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  return { start, end: Math.min(end, totalSize - 1) };
};

const handleProxyStreamRequest = async (c: any) => {
  const { url: targetUrl, headers: headersParam, filename } = c.req.valid('query');
  let customHeaders: Record<string, string> = {};

  if (headersParam) {
    try {
      customHeaders = { ...JSON.parse(headersParam) };
    } catch {
      // 忽略无效 JSON
    }
  }

  // 1. 尝试透传前端的 Range 请求
  const clientRange = c.req.header('range');
  if (clientRange) {
    customHeaders['Range'] = clientRange;
  }

  try {
    const response = await proxyGet(targetUrl, customHeaders);
    const contentLengthStr = response.headers.get('content-length');
    const totalSize = contentLengthStr ? parseInt(contentLengthStr, 10) : 0;

    // 2. 核心逻辑：目标服务器不支持 Range (返回了200)，但前端需要 Range
    if (clientRange && response.status === 200 && totalSize > 0 && response.body) {
      const rangeParams = parseRange(clientRange, totalSize);
      
      if (rangeParams) {
        const { start, end } = rangeParams;
        const chunkLength = end - start + 1;

        // 手动切割流
        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body!.getReader();
            let bytesRead = 0;

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkStart = bytesRead;
                const chunkEnd = bytesRead + value.length;

                // 判断当前数据块是否在前端请求的范围区间内
                if (chunkEnd > start && chunkStart <= end) {
                  const sliceStart = Math.max(0, start - chunkStart);
                  const sliceEnd = Math.min(value.length, end - chunkStart + 1);
                  controller.enqueue(value.slice(sliceStart, sliceEnd));
                }

                bytesRead += value.length;

                // 如果已经读到了前端需要的结尾，掐断上游连接，节省带宽
                if (bytesRead > end) {
                  reader.cancel();
                  break;
                }
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          }
        });

        // 构造伪装的 206 响应头
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        newHeaders.set('Content-Length', String(chunkLength));
        newHeaders.set('Accept-Ranges', 'bytes');

        return new Response(stream, {
          status: 206,
          statusText: 'Partial Content',
          headers: newHeaders,
        });
      }
    }

    // 3. 常规处理 (目标服务器原生支持了 206，或者没有 Range 请求)
    const streamResponse = handleStreamResponse(response);
    
    if (filename) {
      const newHeaders = new Headers(streamResponse.headers);
      const encodedFilename = encodeURIComponent(filename);
      newHeaders.set(
        'Content-Disposition', 
        `attachment; filename="${filename.replace(/"/g, '"')}"; filename*=UTF-8''${encodedFilename}`
      );
      return new Response(streamResponse.body, {
        status: streamResponse.status,
        headers: newHeaders,
      });
    }

    return streamResponse;

  } catch (e: any) {
    console.error("Proxy stream error:", e);
    return fail(c, `Proxy error: ${e.message || "Unknown error"}`, 500);
  }
};

// Protected route for general proxy
proxyRoutes.get(
  '/',
  zValidator('query', proxySchema),
  handleProxyRequest
);

proxyRoutes.get(
  '/stream',
  zValidator('query', proxySchema),
  handleProxyStreamRequest
);
