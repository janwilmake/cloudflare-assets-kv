//@ts-check
/// <reference types="@cloudflare/workers-types" />

/**
 * Options for the withAssetsKV wrapper
 */
interface AssetsKvOptions {
  /** KV namespace binding name (defaults to 'ASSETS_KV') */
  kvNamespace?: string;
  /** Paths to exclude from asset handling */
  excludePaths?: string[];
  /** Path prefix to add when looking up assets in KV (e.g., 'assets/') */
  pathPrefix?: string;
  /** Cache control header value for assets (defaults to 1 year) */
  cacheControl?: string;
  /** Browsers to include in cache control for assets */
  browserTTL?: number;
  /** Whether to include hostname in the KV key */
  includeHost?: boolean;
}

/**
 * Default options for asset handling
 */
const defaultOptions: AssetsKvOptions = {
  kvNamespace: "ASSETS_KV",
  excludePaths: [],
  pathPrefix: "",
  cacheControl: "public, max-age=31536000",
  browserTTL: 31536000, // 1 year in seconds
  includeHost: false,
};

/**
 * Map of file extensions to content types
 */
const contentTypeMap: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain",
  md: "text/markdown",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
  xml: "application/xml",
};

/**
 * Wrapper function to handle static assets from KV before your worker code
 *
 * @param handler Your worker fetch handler
 * @param options Configuration options for asset handling
 * @returns A wrapped fetch handler that handles assets from KV
 */
export function withAssetsKV<Env extends Record<string, any>>(
  handler: (
    request: Request,
    env: Env,
    ctx: any,
  ) => Promise<Response> | Response,
  options: AssetsKvOptions = {},
) {
  // Merge provided options with defaults
  const opts = { ...defaultOptions, ...options };

  return async (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Skip asset handling for excluded paths
    if (opts.excludePaths?.some((path) => pathname.startsWith(path))) {
      return handler(request, env, ctx);
    }

    // Only proceed with GET requests
    if (request.method !== "GET") {
      return handler(request, env, ctx);
    }

    try {
      // Build the KV key
      let key = pathname;

      // Add index.html to root or directory paths
      if (key.endsWith("/") || key === "") {
        key += "index.html";
      }

      // Remove leading slash
      if (key.startsWith("/")) {
        key = key.substring(1);
      }

      // Add path prefix if specified
      if (opts.pathPrefix) {
        key = `${opts.pathPrefix}${key}`;
      }

      // Add hostname if specified
      if (opts.includeHost) {
        key = `${url.hostname}/${key}`;
      }

      // Access the KV namespace from env using the provided namespace name
      const kvNamespace = env[opts.kvNamespace!];

      if (!kvNamespace) {
        console.error(
          `KV namespace ${opts.kvNamespace} not found in environment`,
        );
        return handler(request, env, ctx);
      }

      // Check if the asset exists in KV
      const asset = await kvNamespace.get(key, { type: "arrayBuffer" });

      if (asset === null) {
        // Asset not found in KV, continue to worker handler
        return handler(request, env, ctx);
      }

      // Asset found, determine content type
      const extension = key.split(".").pop()?.toLowerCase() || "";
      const contentType =
        contentTypeMap[extension] || "application/octet-stream";

      // Generate ETag for cache validation
      const etag = `"${key}-${new Date().getTime().toString(16)}"`;

      // Create response with appropriate headers
      const response = new Response(asset, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": opts.cacheControl!,
          ETag: etag,
        },
      });

      return response;
    } catch (error) {
      console.error(`Error serving asset from KV: ${error}`);
      // On error, fall back to the worker handler
      return handler(request, env, ctx);
    }
  };
}
