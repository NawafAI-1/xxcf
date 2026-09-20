/** @type {import('next').NextConfig} */

// GitHub Pages serves a project site from https://<owner>.github.io/<repo>/,
// so every asset URL needs the repository name as a prefix. Derive it from the
// repository the workflow is actually running in rather than hardcoding one
// name — a rename, a fork, or a second repo then publishes correctly with no
// edit here. A user/org site (<owner>.github.io) or a custom domain serves from
// the root instead: set PAGES_BASE_PATH="" in the workflow to opt out.
const repo = (process.env.GITHUB_REPOSITORY ?? '').split('/')[1] ?? '';
const inferredBasePath =
  process.env.GITHUB_ACTIONS === 'true' && repo && !repo.endsWith('.github.io') ? `/${repo}` : '';
const basePath = process.env.PAGES_BASE_PATH ?? inferredBasePath;

const nextConfig = {
  output: 'export',
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: { unoptimized: true },
  webpack: (config) => {
    // @xenova/transformers pulls in onnxruntime-node's native bindings as an
    // optional backend; the browser build only ever uses onnxruntime-web, so
    // keep webpack from trying to bundle the native .node files.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
    };
    return config;
  },
};

module.exports = nextConfig;
