import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { proxyGet, handleStreamResponse } from '@utils/proxy';
import type { Env } from '../types/hono';
import { fail } from '@utils/response';

export const proxyRoutes = new Hono<{ Bindings: Env }>();

const PROXY_RECURSION_HEADER = 'X-Otter-Proxy-Request';

const proxySchema = z.object({
  url: z.string().url(),
  headers: z.string().optional(),
  filename: z.string().optional(),
});

type ProxyQuery = z.infer<typeof proxySchema>;

// --- 辅助函数 ---

// 1. 错误处理
const handleError = (c: Context, e: any) => {
  console.error('Proxy error:', e);
  const status = e.message?.includes('Recursive') ? 400 : (e.status || 500);
  return fail(c, `Proxy error: ${e.message || 'Unknown error'}`, status);
};

// 2. 统一处理响应头
const applyCommonHeaders = (c: Context, headers: Headers, filename?: string) => {
  if (filename) {
    const encoded = encodeURIComponent(filename);
    headers.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`);
  }
  
  const origin = c.req.header('origin');
  headers.set('Access-Control-Allow-Origin', origin && origin !== 'null' ? origin : '*');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  
  return headers;
};

// 3. 解析与校验参数
const parseProxyParams = (c: Context, query: ProxyQuery) => {
  const { url: targetUrl, headers: headersParam, filename } = query;
  const targetHost = new URL(targetUrl).host;

  // 严苛的递归拦截
  if (c.req.header(PROXY_RECURSION_HEADER) || c.req.header('host') === targetHost) {
    throw new Error('Recursive proxy request detected');
  }

  const customHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    [PROXY_RECURSION_HEADER]: '1', // 标记代理请求
  };

  // 过滤敏感 Header 注入
  if (headersParam) {
    try {
      const parsed = JSON.parse(headersParam);
      const forbiddenKeys = ['host', 'referer', PROXY_RECURSION_HEADER.toLowerCase()];
      for (const [k, v] of Object.entries(parsed)) {
        if (!forbiddenKeys.includes(k.toLowerCase())) {
          customHeaders[k.toLowerCase()] = String(v);
        }
      }
    } catch {}
  }

  const range = c.req.header('range');
  if (range) customHeaders['range'] = range;

  return { targetUrl, customHeaders, filename, range };
};

// 4. 解析 Range (优化：增加非法 Range 与 416 校验)
const parseRange = (range: string, totalSize: number): { start: number, end: number } | '416' | null => {
  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  const finalEnd = Math.min(end, totalSize - 1);

  if (start > finalEnd || start >= totalSize) return '416';
  return { start, end: finalEnd };
};

// 5. 高效切割数据流 (使用 subarray 避免内存拷贝)
const sliceStream = (body: ReadableStream<Uint8Array>, start: number, end: number) => {
  let bytesRead = 0;
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkStart = bytesRead;
          const chunkEnd = bytesRead + value.length;
          bytesRead += value.length;

          // 若当前块在需求范围内，则截取并压入
          if (chunkEnd > start && chunkStart <= end) {
            const sliceStart = Math.max(0, start - chunkStart);
            const sliceEnd = Math.min(value.length, end - chunkStart + 1);
            controller.enqueue(value.subarray(sliceStart, sliceEnd));
          }

          if (bytesRead > end) {
            await reader.cancel();
            break;
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    }
  });
};

// --- 路由处理 ---

const validator = zValidator('query', proxySchema);

proxyRoutes.get('/', validator, async (c) => {
  try {
    const { targetUrl, customHeaders, filename } = parseProxyParams(c, c.req.valid('query'));
    const response = handleStreamResponse(await proxyGet(targetUrl, customHeaders));
    
    return new Response(response.body, {
      status: response.status,
      headers: applyCommonHeaders(c, new Headers(response.headers), filename),
    });
  } catch (e: any) {
    return handleError(c, e);
  }
});

proxyRoutes.get('/stream', validator, async (c) => {
  try {
    const { targetUrl, customHeaders, filename, range: clientRange } = parseProxyParams(c, c.req.valid('query'));
    const response = await proxyGet(targetUrl, customHeaders);
    const totalSize = parseInt(response.headers.get('content-length') || '0', 10);

    // 优化：严格限制 fallback 206 仅在明确带有 Range 且上游完全不支持(回退200)时触发
    if (clientRange && response.status === 200 && totalSize > 0 && response.body) {
      const rangeParams = parseRange(clientRange, totalSize);
      
      if (rangeParams === '416') {
        return new Response(null, { status: 416, statusText: 'Range Not Satisfiable' });
      }

      if (rangeParams) {
        const { start, end } = rangeParams;
        const headers = applyCommonHeaders(c, new Headers(response.headers), filename);
        
        headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        headers.set('Content-Length', String(end - start + 1));
        headers.set('Accept-Ranges', 'bytes');

        return new Response(sliceStream(response.body, start, end), {
          status: 206,
          statusText: 'Partial Content',
          headers,
        });
      }
    }

    const streamResponse = handleStreamResponse(response);
    return new Response(streamResponse.body, {
      status: streamResponse.status,
      headers: applyCommonHeaders(c, new Headers(streamResponse.headers), filename),
    });
  } catch (e: any) {
    return handleError(c, e);
  }
});