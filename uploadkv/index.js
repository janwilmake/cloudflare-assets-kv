#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execPromise = promisify(exec);
const readdirPromise = promisify(fs.readdir);
const readFilePromise = promisify(fs.readFile);
const statPromise = promisify(fs.stat);
const accessPromise = promisify(fs.access);

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dryrun");
const useLocal = args.includes("--local");

/**
 * Parse .assetsignore file and return an array of glob patterns
 * @param {string} filePath - Path to .assetsignore file
 * @returns {Promise<string[]>} - Array of glob patterns
 */
async function parseIgnoreFile(filePath) {
  try {
    await accessPromise(filePath, fs.constants.R_OK);
    const content = await readFilePromise(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    // Return default ignores if file doesn't exist
    return ["node_modules", ".wrangler", ".git", ".DS_Store"];
  }
}

/**
 * Check if a file or directory should be ignored based on ignore patterns
 * @param {string} filePath - Path to check
 * @param {string[]} ignorePatterns - Array of ignore patterns
 * @returns {boolean} - True if file should be ignored
 */
function shouldIgnore(filePath, ignorePatterns) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return ignorePatterns.some((pattern) => {
    // Handle exact matches
    if (normalizedPath === pattern) return true;
    // Handle directory patterns ending with /
    if (pattern.endsWith("/") && normalizedPath.startsWith(pattern))
      return true;
    // Handle wildcard patterns
    if (pattern.includes("*")) {
      const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
      return new RegExp(`^${regexPattern}$`).test(normalizedPath);
    }
    // Handle path components
    return (
      normalizedPath.split("/").includes(pattern) ||
      normalizedPath.startsWith(pattern + "/")
    );
  });
}

/**
 * Recursively list all files in a directory
 * @param {string} dir - Directory to scan
 * @param {string} baseDir - Base directory for relative paths
 * @param {string[]} ignorePatterns - Patterns to ignore
 * @returns {Promise<string[]>} - Array of file paths
 */
async function listAllFiles(dir, baseDir, ignorePatterns) {
  const files = [];
  const entries = await readdirPromise(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldIgnore(relativePath, ignorePatterns)) {
      continue;
    }

    const stats = await statPromise(fullPath);
    if (stats.isDirectory()) {
      const subDirFiles = await listAllFiles(fullPath, baseDir, ignorePatterns);
      files.push(...subDirFiles);
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Get file content type based on extension
 * @param {string} filePath - Path to the file
 * @returns {string} - Content type
 */
function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase().slice(1);
  const contentTypeMap = {
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

  return contentTypeMap[extension] || "application/octet-stream";
}

/**
 * Upload a file to KV using Wrangler
 * @param {string} filePath - Path to the file
 * @param {string} key - KV key
 * @param {string} namespaceIdOrBinding - KV namespace ID or binding name
 * @param {boolean} isNamespaceId - Whether the namespace parameter is an ID or binding name
 * @param {boolean} isDryRun - Whether this is a dry run
 * @param {boolean} isLocal - Whether to use local storage
 * @returns {Promise<void>}
 */
async function uploadFile(
  filePath,
  key,
  namespaceIdOrBinding,
  isNamespaceId,
  isDryRun,
  isLocal,
) {
  const contentType = getContentType(filePath);
  console.log(`Uploading ${filePath} -> ${key} (${contentType})`);

  if (isDryRun) return;

  try {
    // Build the command based on whether we have a namespace ID or binding name
    let command = `npx wrangler kv key put ${useLocal ? "" : "--remote "}`;

    // Add namespace identifier (either --namespace-id or --binding)
    if (isNamespaceId) {
      command += `--namespace-id="${namespaceIdOrBinding}" `;
    } else {
      command += `--binding="${namespaceIdOrBinding}" `;
    }

    // Add the key and path to the file
    command += `"${key}" --path="${filePath}" `;

    // Add metadata with content type
    command += `--metadata='{"contentType":"${contentType}"}' `;

    // Add local flag if specified
    if (isLocal) {
      command += `--local `;
    }

    // Execute the command
    const { stdout, stderr } = await execPromise(command);
    if (stderr) console.error(`Error: ${stderr}`);
    if (stdout) console.log(`Success: ${stdout.trim()}`);
  } catch (error) {
    console.error(`Failed to upload ${filePath}: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Check if wrangler is installed
    try {
      await execPromise("npx wrangler --version");
    } catch (error) {
      console.error(
        'Error: Wrangler is not installed. Please install it with "npm install -g wrangler"',
      );
      process.exit(1);
    }

    console.log("🚀 Cloudflare Workers KV Asset Uploader");
    console.log("=======================================");

    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No files will be uploaded");
    }

    if (useLocal) {
      console.log("💻 LOCAL MODE - Using local KV storage");
    }

    // Determine if .assetsignore exists and base path
    const assetsIgnorePath = path.join(process.cwd(), ".assetsignore");
    let basePath;

    try {
      await accessPromise(assetsIgnorePath, fs.constants.R_OK);
      console.log("✅ Found .assetsignore in current directory");
      basePath = process.cwd();
    } catch (error) {
      const publicDir = path.join(process.cwd(), "public");
      try {
        await accessPromise(publicDir, fs.constants.R_OK);
        console.log('✅ Using "public" directory as base path');
        basePath = publicDir;
      } catch (error) {
        console.log(
          "⚠️ No .assetsignore or public directory found, using current directory as base",
        );
        basePath = process.cwd();
      }
    }

    // Parse .assetsignore file
    const ignorePatterns = await parseIgnoreFile(assetsIgnorePath);
    console.log("Ignore patterns:", ignorePatterns);

    // Parse wrangler.toml to get KV namespace info
    let kvNamespace = "ASSETS_KV";
    let namespaceId = "";
    let useNamespaceId = false;

    try {
      const wranglerPath = path.join(process.cwd(), "wrangler.toml");
      const wranglerContent = await readFilePromise(wranglerPath, "utf8");

      // Extract KV namespace binding
      const bindingMatch = wranglerContent.match(/binding\s*=\s*"([^"]+)"/);
      if (bindingMatch) kvNamespace = bindingMatch[1];

      // Extract KV namespace ID
      const idMatch = wranglerContent.match(/id\s*=\s*"([^"]+)"/);
      if (idMatch) {
        namespaceId = idMatch[1];
        useNamespaceId = true;
      }

      console.log(
        `📦 Found KV namespace: ${kvNamespace}${
          namespaceId ? ` (ID: ${namespaceId})` : ""
        }`,
      );
    } catch (error) {
      console.log(
        "⚠️ Could not parse wrangler.toml, using default namespace ASSETS_KV",
      );
    }

    // Get all files to upload
    console.log(`🔍 Scanning files in ${basePath}`);
    const files = await listAllFiles(basePath, basePath, ignorePatterns);

    console.log(`📁 Found ${files.length} files to upload`);

    // Upload files
    console.log("📤 Starting upload...");

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(basePath, file);

      // Create appropriate key
      // Remove leading slashes to match the index.ts format
      let key = file.replace(/\\/g, "/");
      if (key.startsWith("/")) {
        key = key.substring(1);
      }

      // Upload with binding name or namespace ID
      await uploadFile(
        filePath,
        key,
        useNamespaceId ? namespaceId : kvNamespace,
        useNamespaceId,
        dryRun,
        useLocal,
      );

      // Show progress
      console.log(
        `Progress: ${i + 1}/${files.length} (${Math.round(
          ((i + 1) / files.length) * 100,
        )}%)`,
      );
    }

    console.log("✅ Upload complete!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the main function
main();
