import { SearchParamsOption } from '@reverier/ky'
import api, { api_root } from '.'
import { User } from '../models/user'

export async function getUserList(
  page?: number,
  page_size?: number,
  order?: string,
  filter?: string,
  with_institute_id?: number
) {
  return await api
    .get(`${api_root}/user`, {
      searchParams: JSON.parse(
        JSON.stringify({
          page,
          page_size,
          order,
          filter,
          with_institute_id,
        })
      ) as SearchParamsOption,
    })
    .json<[User[], number]>()
}
