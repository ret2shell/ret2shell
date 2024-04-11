import api, { api_root } from '.'

export async function deunicode(text: string) {
  return (await api.get(`${api_root}/rpc/string/deunicode?text=${text}`)).text()
}

export async function leet(text: string) {
  return (await api.get(`${api_root}/rpc/string/leet?text=${text}`)).text()
}
