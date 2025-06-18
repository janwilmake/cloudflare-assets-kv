# path-kv

[![janwilmake/cloudflare-assets-kv context](https://badge.forgithub.com/janwilmake/cloudflare-assets-kv)](https://uithub.com/janwilmake/cloudflare-assets-kv)

This library allows to add a single line to your fetch handler to serve dynamic assets from KV with the following rules:

- Assets must be saved at the full path you would normally save assets in `public`, including `/index` and `.html|md` etc.
- If extension was provided, will only check the full path
- Will look for `/index.{ext}` if your path ends with a `/`
- If extension wasn't provided, will parse accept header and look for most logical `.{ext}` based on the correct priority.
- If accept header is `*/*` or not provided, will look for all available in this order: txt, md, json, html

It requires `env.PATH_KV` to be a KV with files with keys being the full file paths. Allows optional configurable prefix.

Made this feature request: https://x.com/janwilmake/status/1917123946798793121

## Quick Start

1. Install: `npm i path-kv`
2. Create your KV and add it to wrangler using `wrangler kv namespace create PATH_KV`
3. Use the middleware in your worker:

```js
import { withPathKv } from "path-kv";

export default {
  fetch: withPathKv(async (request, env, ctx) => {
    // Your worker code here
    return new Response("Not Found", { status: 404 });
  }),
};
```

Now, any files you make available in your KV will be served directly by your handler. Be sure to add `contentType`

```ts
await env.PATH_KV.put("/index.html", newContent, {
  metadata: { contentType: "text/html" },
});
```

## Helper: Adding static assets from local files

To some it may be useful to quickly add files from `public` to your kv. For that you can just run `npx uploadkv`.
