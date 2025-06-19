interface PathKvOptions {
  kvBinding?: string;
  prefix?: string;
}

interface KVNamespace {
  get(
    key: string,
    options?: { type: "text" | "json" | "arrayBuffer" | "stream" },
  ): Promise<string | null>;
  getWithMetadata(
    key: string,
    options?: { type: "text" | "json" | "arrayBuffer" | "stream" },
  ): Promise<{
    value: string | null;
    metadata: any;
  }>;
}

interface Env {
  PATH_KV: KVNamespace;
  [key: string]: any;
}

const DEFAULT_EXTENSIONS = ["txt", "md", "json", "html"];

function parseAcceptHeader(acceptHeader: string | null): string[] {
  if (!acceptHeader || acceptHeader === "*/*") {
    return DEFAULT_EXTENSIONS;
  }

  const acceptTypes = acceptHeader
    .split(",")
    .map((type) => type.trim().split(";")[0])
    .filter((type) => type !== "*/*");

  const extensions: string[] = [];

  for (const type of acceptTypes) {
    switch (type) {
      case "text/html":
        extensions.push("html");
        break;
      case "application/json":
        extensions.push("json");
        break;
      case "text/markdown":
      case "text/x-markdown":
        extensions.push("md");
        break;
      case "text/plain":
        extensions.push("txt");
        break;
    }
  }

  // Add remaining default extensions that weren't already added
  for (const ext of DEFAULT_EXTENSIONS) {
    if (!extensions.includes(ext)) {
      extensions.push(ext);
    }
  }

  return extensions;
}

function getContentType(extension: string): string {
  const contentTypes: Record<string, string> = {
    html: "text/html",
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    css: "text/css",
    js: "application/javascript",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    pdf: "application/pdf",
  };

  return contentTypes[extension] || "application/octet-stream";
}

async function tryGetFromKV(
  kv: KVNamespace,
  path: string,
  prefix: string = "",
): Promise<{ content: string; contentType: string } | null> {
  const fullPath = prefix + path;

  try {
    const result = await kv.getWithMetadata(fullPath, { type: "text" });

    if (result.value) {
      const contentType =
        result.metadata?.contentType ||
        getContentType(path.split(".").pop() || "txt");

      return {
        content: result.value,
        contentType,
      };
    }
  } catch (error) {
    console.error(`Error fetching ${fullPath} from KV:`, error);
  }

  return null;
}

export function withPathKv<TEnv>(
  handler: (
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
  ) => Promise<Response>,
  options: PathKvOptions = {},
) {
  const { kvBinding = "PATH_KV", prefix = "" } = options;

  return async (
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    const kv = env[kvBinding] as KVNamespace;

    if (request.method !== "GET") {
      // only get!
      return handler(request, env, ctx);
    }

    if (!kv) {
      console.warn(`KV namespace '${kvBinding}' not found in environment`);
      return handler(request, env, ctx);
    }

    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);

    // Remove trailing slash for non-root paths
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    // Check if path has an extension
    const hasExtension = /\.[^/]+$/.test(path);

    if (hasExtension) {
      // Path has extension, try exact match
      const result = await tryGetFromKV(kv, path, prefix);
      if (result) {
        return new Response(result.content, {
          headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    } else {
      // No extension provided

      // If path ends with /, look for /index.{ext}
      if (url.pathname.endsWith("/")) {
        const indexPath = path + "index";
        const acceptHeader = request.headers.get("accept");
        const extensions = parseAcceptHeader(acceptHeader);

        for (const ext of extensions) {
          const result = await tryGetFromKV(kv, `${indexPath}.${ext}`, prefix);
          if (result) {
            return new Response(result.content, {
              headers: {
                "Content-Type": result.contentType,
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        }
      } else {
        // Try with different extensions based on Accept header
        const acceptHeader = request.headers.get("accept");
        const extensions = parseAcceptHeader(acceptHeader);

        // first try direct
        const result = await tryGetFromKV(kv, path, prefix);
        if (result) {
          return new Response(result.content, {
            headers: {
              "Content-Type": result.contentType,
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
        for (const ext of extensions) {
          const result = await tryGetFromKV(kv, `${path}.${ext}`, prefix);
          if (result) {
            return new Response(result.content, {
              headers: {
                "Content-Type": result.contentType,
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        }
      }
    }

    // If no file found in KV, continue to original handler
    return handler(request, env, ctx);
  };
}
