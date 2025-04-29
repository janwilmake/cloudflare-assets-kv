# cloudflare-assets-kv

A simple library to serve and dynamically update static assets from Cloudflare KV storage in your Workers.

## Quick Start

### 1. Set up your wrangler.toml

Add an ASSETS_KV namespace to your wrangler.toml:

```toml
[[kv_namespaces]]
binding = "ASSETS_KV"
id = "your-kv-namespace-id"
```

### 2. Install the package

```bash
npm install cloudflare-assets-kv
```

### 3. Use the middleware in your Worker

```js
import { withAssetsKV } from "cloudflare-assets-kv";

export default {
  fetch: withAssetsKV(
    async (request, env, ctx) => {
      // Your worker code here
      return new Response("Not Found", { status: 404 });
    },
    {
      excludePaths: ["/api/"], // Optional: paths to exclude from KV lookup
    },
  ),
};
```

### 4. Configure your asset sources

Create a `.assetsignore` file in your project root to exclude files and directories:

```
node_modules
.wrangler
.git
.DS_Store
```

Alternatively, place your assets in a `public` directory.

### 5. Add your static assets

Put your static assets in the project root (or public directory).

### 6. Upload assets to KV

```bash
npx uploadkv
```

Options:

- `--dryrun`: Show what would be uploaded without uploading
- `--local`: Use local KV storage for development

### 7. Dynamically update assets

You can read and write assets directly in your worker code:

```js
// Read an asset
const asset = await env.ASSETS_KV.get("index.html", { type: "text" });

// Update an asset
await env.ASSETS_KV.put("index.html", newContent, {
  metadata: {
    contentType: "text/html",
    updated: new Date().toISOString(),
  },
});
```

## Configuration Options

The `withAssetsKV` middleware accepts these options:

```js
{
  kvNamespace: "ASSETS_KV", // KV namespace binding name
  excludePaths: [], // Paths to exclude from asset handling
  pathPrefix: "", // Path prefix to add when looking up assets in KV
  cacheControl: "public, max-age=31536000", // Cache control header value
  browserTTL: 31536000, // Browser cache TTL in seconds
  includeHost: false // Whether to include hostname in the KV key
}
```
