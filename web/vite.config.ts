import path from "node:path";
import { defineConfig } from "vite";
import viteCompression from "vite-plugin-compression";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
    plugins: [
        solidPlugin(),
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
    ],
    server: {
        port: 5173,
    },
    build: {
        target: "esnext",
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
});
