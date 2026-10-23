import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteCompression from "vite-plugin-compression";
import solidPlugin from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development" || process.env.NODE_ENV === "development";
  const isProd = !isDev;

  return {
    plugins: [
      solidPlugin(),
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
        name: "rune-loader",
        transform(code, id) {
          if (id.slice(-3) === ".rx") {
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
