import { withPathKv } from "./path-kv";

interface Env {
  PATH_KV: KVNamespace;
}

const defaultIndexHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Dynamic Message</title>
</head>
<body>
    <h1>{{MESSAGE}}</h1>
    <form method="POST" action="/set">
        <input type="text" name="message" placeholder="Enter new message" required>
        <button type="submit">Update</button>
    </form>
</body>
</html>
`;

export default {
  fetch: withPathKv<Env>(async (request, env, ctx) => {
    const url = new URL(request.url);

    // Serve default index if no custom one exists in KV
    if (url.pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    // is '/'

    if (request.method === "POST") {
      const formData = await request.formData();
      const message = formData.get("message")?.toString();

      if (!message) {
        return new Response("Message required", { status: 400 });
      }

      const updatedHtml = defaultIndexHtml.replace("{{MESSAGE}}", message);

      await env.PATH_KV.put("/index.html", updatedHtml, {
        metadata: { contentType: "text/html" },
      });
    }

    try {
      // Try to get custom version from KV first
      const stored = await env.PATH_KV.get("/index.html");
      if (stored) {
        return new Response(stored, {
          headers: { "Content-Type": "text/html" },
        });
      }
    } catch (e) {
      // Fall through to default
    }

    // Serve default with placeholder
    return new Response(
      defaultIndexHtml.replace("{{MESSAGE}}", "Hello World!"),
      { headers: { "Content-Type": "text/html" } },
    );
  }),
};
