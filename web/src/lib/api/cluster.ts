import api, { api_root } from '.'

export async function getClusterConfig() {
  return await api.get(`${api_root}/cluster/config`).json()
}

export async function getClusterNodes() {
  return await api.get(`${api_root}/cluster/nodes`).json()
}
