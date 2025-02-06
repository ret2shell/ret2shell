import { addDynamicIconSelectors } from "@iconify/tailwind";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  plugins: [addDynamicIconSelectors()],
};
