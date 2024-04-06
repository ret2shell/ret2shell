import ky from 'ky'
import { Accessor, createSignal } from 'solid-js'
import { Instance, Traffic } from '@models/instance'

export class Wsrx {
  private readonly api = 'http://localhost:3307'
  connected: Accessor<boolean>
  setConnected: (connected: boolean) => void
  instances: Accessor<Instance[]>
  setInstances: (instances: Instance[]) => void
  traffic: Accessor<Traffic[]>
  setTraffic: (traffic: Traffic[]) => void
  constructor() {
    ;[this.connected, this.setConnected] = createSignal(false)
    ;[this.instances, this.setInstances] = createSignal([])
    ;[this.traffic, this.setTraffic] = createSignal([])
    this.checkConnection()
  }
  async checkConnection() {
    ky.get(`${this.api}/connect`)
      .then(() => {
        this.setConnected(true)
      })
      .catch(() => {
        this.setConnected(false)
      })
  }
  async tryConnect() {
    await ky.post(`${this.api}/connect`, {
      json: location.origin,
    })
  }
}

export const wsrx = new Wsrx()
