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
        "@": path.resolve(__dirname, "src"),
        "@lib": path.resolve(__dirname, "src/lib"),
        "@api": path.resolve(__dirname, "src/lib/api"),
        "@assets": path.resolve(__dirname, "src/lib/assets"),
        "@blocks": path.resolve(__dirname, "src/lib/blocks"),
        "@models": path.resolve(__dirname, "src/lib/models"),
        "@storage": path.resolve(__dirname, "src/lib/storage"),
        "@widgets": path.resolve(__dirname, "src/lib/widgets"),
        "@routes": path.resolve(__dirname, "src/routes"),
      },
    },
  };
});
