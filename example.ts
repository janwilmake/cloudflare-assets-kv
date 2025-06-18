import { withPathKv } from "./path-kv";
//@ts-ignore
import indexHtml from "./index.html";

interface Env {
  PATH_KV: KVNamespace;
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

// Export the worker with the withAssetsKV wrapper
export default {
  fetch: withPathKv<Env>(async (request, env, ctx) => {
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

        console.log("setting with message", message);
        // Write the updated HTML back to KV
        await env.PATH_KV.put("/index.html", updatedHtml, {
          metadata: { contentType: "text/html" },
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
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(indexHtml, {
        status: 200,
        headers: { "Content-Type": "text/html;charset=utf8" },
      });
    }
    // Handle 404s
    return new Response("Not found", { status: 404 });
  }),
};
