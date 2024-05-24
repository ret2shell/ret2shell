import api, { api_root } from '.'

export type ClusterConfig = {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    selfLink: string
    uid: string
    resourceVersion: string
    creationTimestamp: string
  }
  data: {
    [key: string]: string
  }
}

export type ClusterConfigs = {
  apiVersion: string
  items: ClusterConfig[]
}

export async function getClusterConfig() {
  return await api.get(`${api_root}/cluster/config`).json<ClusterConfigs>()
}

export async function getClusterNodes() {
  return await api.get(`${api_root}/cluster/nodes`).json()
}
