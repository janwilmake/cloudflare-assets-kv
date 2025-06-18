import { withPathKv } from "./path-kv";

interface Env {
  PATH_KV: KVNamespace;
}

const defaultIndexHtml = `<h1>{{MESSAGE}}</h1><form method="POST">
<input type="text" name="message" placeholder="Enter new message" required>
<button type="submit">Update</button></form>`;
export default {
  fetch: withPathKv<Env>(async (request, env, ctx) => {
    const url = new URL(request.url);
    if (url.pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }
    let html = defaultIndexHtml;
    if (request.method === "POST") {
      // Update the HTML
      const formData = await request.formData();
      const message = formData.get("message")?.toString();
      if (!message) {
        return new Response("Message required", { status: 400 });
      }
      html = defaultIndexHtml.replace("{{MESSAGE}}", message);
      await env.PATH_KV.put("/index.html", html, {
        metadata: { contentType: "text/html" },
      });
    }
    // Serve default with placeholder
    return new Response(html.replace("{{MESSAGE}}", "Hello World!"), {
      headers: { "Content-Type": "text/html" },
    });
  }),
};
