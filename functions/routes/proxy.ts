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
  let customHeaders: Record<string, string> = {};

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
    
    // If filename is provided, force download
    if (filename) {
      const streamResponse = handleStreamResponse(response);
      const newHeaders = new Headers(streamResponse.headers);
      
      // Preserve spaces in filename - use raw filename for fallback and encoded for RFC 5987
      const encodedFilename = encodeURIComponent(filename);
      // For filename="" part, use raw filename (browsers handle spaces better here)
      // For filename*=UTF-8'' part, use encoded filename for RFC 5987 compliance
      newHeaders.set(
        'Content-Disposition', 
        `attachment; filename="${filename.replace(/"/g, '"')}"; filename*=UTF-8''${encodedFilename}`
      );
      
      return new Response(streamResponse.body, {
        status: streamResponse.status,
        statusText: streamResponse.statusText,
        headers: newHeaders,
      });
    }

    return handleStreamResponse(response);
  } catch (e: any) {
    console.error("Proxy error:", e);
    return fail(c, `Proxy error: ${e.message || "Unknown error"}`, 500);
  }
};

// Protected route for general proxy
proxyRoutes.get(
  '/',
  zValidator('query', proxySchema),
  handleProxyRequest
);
