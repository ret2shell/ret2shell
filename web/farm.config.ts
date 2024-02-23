import { defineConfig } from '@farmfe/core'
import solid from '@farmfe/js-plugin-solid'
import postcss from '@farmfe/js-plugin-postcss'

export default defineConfig({
  plugins: [postcss(), solid()],
  server: {
    hmr: true,
  },
})
