import { luxonReplacer, luxonReviver } from '@models/utils'
import { accountStore, userLogin, userReset } from '@storage/account'
import ky from '@reverier/ky'

export const api_root = import.meta.env.VITE_API_ROOT || '/api'

const api = ky.extend({
  parseJson: text => JSON.parse(text, luxonReviver),
  stringifyJson: data => JSON.stringify(data, luxonReplacer),
  hooks: {
    beforeRequest: [
      async request => {
        const token = accountStore.token
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          userReset()
        }
        if (response.headers.has('Set-Token')) {
          const token = response.headers.get('Set-Token')
          if (token) {
            userLogin(token)
          }
        }
      },
    ],
  },
})

export default api
