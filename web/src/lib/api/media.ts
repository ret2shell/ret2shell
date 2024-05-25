import api, { api_root } from '.'
import { Media } from '../models/media'

export async function uploadMedia(file: File, thumbnail?: boolean) {
  const formData = new FormData()
  formData.append('file', file)
  return await api
    .post(`${api_root}/media`, {
      body: formData,
      searchParams: JSON.parse(
        JSON.stringify({
          thumbnail,
        })
      ),
    })
    .json<Media>()
}
