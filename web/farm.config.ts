import { defineConfig } from '@farmfe/core'
import solid from '@farmfe/js-plugin-solid'
import postcss from '@farmfe/js-plugin-postcss'
import sass from '@farmfe/js-plugin-sass'

export default defineConfig({
  plugins: [postcss(), sass(), solid()],
  server: {
    hmr: true,
    port: 5173,
  },
})
