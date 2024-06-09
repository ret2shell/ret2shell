import { addDynamicIconSelectors } from "@iconify/tailwind";
import typography from "@tailwindcss/typography";
import { okwind } from "okwind";
import type { Config } from "tailwindcss";

const fontFamily = [
    "JetBrains Mono",
    "Menlo",
    "-apple-system",
    '"Noto Sans"',
    '"Helvetica Neue"',
    "Helvetica",
    '"Nimbus Sans L"',
    "Arial",
    '"Liberation Sans"',
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Noto Sans CJK SC"',
    '"Source Han Sans SC"',
    '"Source Han Sans CN"',
    '"Microsoft YaHei"',
    "Consolas",
    "Courier",
    "monospace",
];

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        fontFamily: {
            sans: fontFamily,
            mono: fontFamily,
            serif: fontFamily,
            display: fontFamily,
            body: fontFamily,
        },
        extend: {
            transitionProperty: {
                size: "width, height",
            },
        },
    },
    okwind: {
        cyber: {
            primary: 248,
            error: 18,
            warning: 48,
            success: 150,
            info: 248,
            secondary: 324,
            accent: 130,
            lightness: 0.64,
            chroma: 0.17,
            bgLight: 0.96,
            bgDark: 0.18,
            bgChroma: 0,
        },
    },
    plugins: [typography, okwind, addDynamicIconSelectors()],
} satisfies Config;
