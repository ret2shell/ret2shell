import { api_root } from '../api'

export function mediaPath(hashUrl: string) {
  const pattern = /[A-Fa-f0-9]{64}/
  if (!pattern.test(hashUrl)) {
    return hashUrl
  }
  return `${api_root}/media?hash=${hashUrl}`
}
