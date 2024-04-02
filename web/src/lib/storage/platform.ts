import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'
import { ServerConfig } from '../models/config'

export const [platformStore, setPlatformStore] = makePersisted(
  createStore({
    config: {
      host: location.hostname,
      port: 0,
      external_domain: location.hostname,
      external_https: location.protocol === 'https:',
      cors_origins: '*',
      api_base_path: '/api',
      name: null as string | null,
      subject_url: null as string | null,
      subject_info: null as string | null,
      footer_url: null as string | null,
      footer_info: null as string | null,
      record: null as string | null,
      hide_maker: false as boolean | null,
    } as ServerConfig,
    version: 'UNKNOWN' as string,
  }),
  { name: 'platform' }
)
