import { withAssetsKV } from "./index";
import indexHtml from "./index.html";
interface Env {
  ASSETS_KV: KVNamespace;
}

/**
 * Parse form data or JSON from request body
 */
async function parseRequestBody(
  request: Request,
): Promise<{ message?: string }> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch (e) {
      return {};
    }
  } else if (contentType.includes("form")) {
    try {
      const formData = await request.formData();
      return {
        message: formData.get("message")?.toString(),
      };
    } catch (e) {
      return {};
    }
  }

  return {};
}

/**
 * Handle API requests and asset updates
 */
async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  // Handle the API endpoint for updating the message
  if (url.pathname === "/set" && request.method === "POST") {
    try {
      // Parse the request body to get the message
      const { message } = await parseRequestBody(request);

      if (!message) {
        return new Response("Message is required", { status: 400 });
      }

      // Replace the placeholder with the new message
      const updatedHtml = indexHtml.replace("{{MESSAGE}}", message);

      // Write the updated HTML back to KV
      await env.ASSETS_KV.put("index.html", updatedHtml, {
        metadata: {
          contentType: "text/html",
          updated: new Date().toISOString(),
        },
      });

      // Redirect back to homepage or return success
      if (request.headers.get("accept")?.includes("application/json")) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return new Response(null, {
          status: 302,
          headers: { Location: "/" },
        });
      }
    } catch (error) {
      console.error("Error updating message:", error);
      return new Response("Error updating message", { status: 500 });
    }
  }

  // Handle 404s
  return new Response("Not Found", { status: 404 });
}

// Export the worker with the withAssetsKV wrapper
export default {
  fetch: withAssetsKV<Env>(
    (request: Request, env: Env, ctx: ExecutionContext) => {
      return handleRequest(request, env, ctx);
    },
    {
      excludePaths: ["/api/"], // Don't check KV for API routes
    },
  ),
};
