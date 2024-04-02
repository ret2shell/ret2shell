import api, { api_root } from '.'
import { AuthConfig, ServerConfig } from '@models/config'

export async function getPlatformInfo() {
  return await api.get(`${api_root}/platform/info`).json<ServerConfig>()
}

export async function getAuthConfig() {
  return await api.get(`${api_root}/platform/auth`).json<AuthConfig>()
}

export async function getVersion() {
  return await api.get(`${api_root}/platform/version`).json<string>()
}
