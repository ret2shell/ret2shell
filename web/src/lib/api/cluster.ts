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

export type ClusterNode = {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    creationTimestamp: string
    labels: {
      [key: string]: string
    }
  }
  spec: {
    podCIDR: string
    podCIDRs: string[]
    providerID: string
    taints: {
      effect: string
      key: string
      timeAdded: string
    }[]
  }
  status: {
    addresses: {
      type: string
      address: string
    }[]
    capacity: {
      [key: string]: string
    }
    allocatable: {
      [key: string]: string
    }
    conditions: {
      type: string
      status: string
      lastHeartbeatTime: string
      lastTransitionTime: string
      reason: string
      message: string
    }[]
  }
}

export type ClusterNodes = {
  apiVersion: string
  items: ClusterNode[]
}

export async function getClusterNodes() {
  return await api.get(`${api_root}/cluster/nodes`).json<ClusterNodes>()
}
