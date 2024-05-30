import api, { api_root } from '.'
import { AuthConfig, ServerConfig } from '@models/config'
import { Institute } from '../models/institute'
import { DateTime } from 'luxon'
import { HostType } from '../models/game'
import { SearchParamsOption } from '@reverier/ky'

export async function getPlatformInfo() {
  return await api.get(`${api_root}/platform/info`).json<ServerConfig>()
}

export async function getAuthConfig() {
  return await api.get(`${api_root}/platform/auth`).json<AuthConfig>()
}

export async function getVersion() {
  return await api.get(`${api_root}/platform/version`).json<string>()
}

export type PlatformStatistics = {
  users: {
    total: number
    valid: number
    institutes: [number, number][]
    ips: number
  }
  institutes: Institute[]
  games: {
    id: number
    name: string
    start_at: DateTime
    end_at: DateTime
    register_at: DateTime
    archive_at: DateTime
    host_type: HostType
    teams: number
  }[]
  submissions: {
    total: number
    solved: number
  }
  challenges: {
    total: number
    in_game: number
  }
}

export async function getPlatformStatistics() {
  return await api.get(`${api_root}/platform/statistics`).json<PlatformStatistics>()
}

export async function getPlatformLogs(file?: string) {
  if (!file) return await api.get(`${api_root}/platform/logs`).json<string[]>()
  return await api
    .get(`${api_root}/platform/logs`, {
      searchParams: JSON.parse(
        JSON.stringify({
          file,
        })
      ) as SearchParamsOption,
    })
    .blob()
}

export type PlatformLicense = {
  issuer: string
  website: string
  date: string
  level: string
}

export async function getPlatformLicense() {
  return await api.get(`${api_root}/platform/license`).json<PlatformLicense>()
}
