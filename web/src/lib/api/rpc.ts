import api, { api_root } from '.'

export async function deunicode(text: string) {
  return (
    await api.get(`${api_root}/rpc/string/deunicode`, { searchParams: JSON.parse(JSON.stringify({ text })) })
  ).text()
}

export async function leet(text: string) {
  return (await api.get(`${api_root}/rpc/string/leet`, { searchParams: JSON.parse(JSON.stringify({ text })) })).text()
}
