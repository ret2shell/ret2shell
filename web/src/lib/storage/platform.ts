import { createStore } from 'solid-js/store'
import { makePersisted } from '@solid-primitives/storage'

export const [platformStore, setPlatformStore] = makePersisted(
  createStore({
    name: null as string | null,
    subject_url: null as string | null,
    subject_info: null as string | null,
    footer_url: 'https://github.com/ret2shell' as string,
    footer_info: 'Ret 2 Shell' as string,
    version: null as string | null,
    record: null as string | null,
    hide_maker: false,
  }),
  { name: 'platform' }
)
