import path from "node:path";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import viteCompression from "vite-plugin-compression";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development" || process.env.NODE_ENV === "development";
  const isProd = !isDev;

  return {
    plugins: [
      solidPlugin({
        frontends: {
          // `.rx` files in this project are data files rendered as text, not
          // ReactiveScript modules, so they are exported verbatim.
          ".rx": {
            compile(source) {
              return { code: `export default ${JSON.stringify(source)};` };
            },
          },
        },
      }),
      tailwindcss(),
      viteCompression(),
      {
        name: "markdown-loader",
        transform(code, id) {
          if (id.slice(-3) === ".md") {
            // For .md files, get the raw content
            return `export default ${JSON.stringify(code)};`;
          }
        },
      },
      {
        name: "ace-esm-resolver-compat",
        enforce: "pre",
        transform(code, id) {
          if (!id.includes("/ace-builds/esm-resolver.js") && !id.includes("\\ace-builds\\esm-resolver.js")) {
            return;
          }
          // Ace documents `esm-resolver` for Vite/Rollup, but the published file
          // still references a bare global `ace` instead of `globalThis.ace`.
          return code.replace(/\bace\./g, "globalThis.ace.");
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: process.env.VITE_DEV_API_TARGET || "http://localhost:8080",
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      target: "es2022",
      minify: isProd,
      sourcemap: isDev,
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        // Solid 1 compat shims for packages that still import the removed
        // `solid-js` subpaths (`@modular-forms/solid`, `@ark-ui/solid`).
        "#solid-compat": path.resolve(import.meta.dirname, "src/lib/vendor/solid-compat.ts"),
        "#solid-web-compat": path.resolve(import.meta.dirname, "src/lib/vendor/solid-web-compat.tsx"),
        "solid-js/web": path.resolve(import.meta.dirname, "src/lib/vendor/solid-web-compat.tsx"),
        "solid-js/store": path.resolve(import.meta.dirname, "src/lib/vendor/solid-compat.ts"),
        "@lib": path.resolve(import.meta.dirname, "src/lib"),
        "@api": path.resolve(import.meta.dirname, "src/lib/api"),
        "@assets": path.resolve(import.meta.dirname, "src/lib/assets"),
        "@blocks": path.resolve(import.meta.dirname, "src/lib/blocks"),
        "@models": path.resolve(import.meta.dirname, "src/lib/models"),
        "@storage": path.resolve(import.meta.dirname, "src/lib/storage"),
        "@widgets": path.resolve(import.meta.dirname, "src/lib/widgets"),
        "@routes": path.resolve(import.meta.dirname, "src/routes"),
      },
    },
  };
});
