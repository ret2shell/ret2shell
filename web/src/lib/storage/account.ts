import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'
import { Permission, Token, User } from '@models/user'
import { getProfile } from '../api/account'
import { fromBase64 } from 'js-base64'

export const [accountStore, setAccountStore] = makePersisted(
  createStore({
    id: null as number | null,
    account: null as string | null,
    nickname: null as string | null,
    token: null as string | null,
    permissions: [] as Permission[],
    info: null as User | null,
  }),
  { name: 'account' }
)

export const userLogin = (token: string) => {
  setAccountStore({ token })
  const tokenRaw = fromBase64(token.split('.')[1])
  const tokenJson = JSON.parse(tokenRaw) as Token
  setAccountStore({
    id: tokenJson.id,
    account: tokenJson.account,
    nickname: tokenJson.nickname,
    permissions: tokenJson.permissions,
  })
}

export const userReset = () => {
  setAccountStore({ id: null, account: null, nickname: null, token: null, info: null, permissions: [] })
}

export const userRefresh = () => {
  if (!accountStore.token) return
  getProfile()
    .then(info => {
      setAccountStore('info', info)
    })
    .catch(() => {
      userReset()
    })
}
