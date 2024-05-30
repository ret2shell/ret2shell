import ky from '@reverier/ky'
import { Accessor, createSignal } from 'solid-js'
import { Instance, Traffic } from '@models/instance'

export enum WsrxState {
  Disconnected = 0,
  Pending = 1,
  Connected = 2,
}

export class Wsrx {
  apiAddr: Accessor<string>
  setApiAddr: (apiAddr: string) => void
  connected: Accessor<WsrxState>
  setConnected: (connected: WsrxState) => void
  instances: Accessor<Instance[]>
  setInstances: (instances: Instance[]) => void
  traffic: Accessor<Traffic[]>
  setTraffic: (traffic: Traffic[]) => void
  constructor() {
    ;[this.connected, this.setConnected] = createSignal(WsrxState.Disconnected)
    ;[this.instances, this.setInstances] = createSignal([])
    ;[this.traffic, this.setTraffic] = createSignal([])
    ;[this.apiAddr, this.setApiAddr] = createSignal('http://127.0.0.1:3307')
  }

  async checkConnection() {
    try {
      const resp = await ky.get(`${this.apiAddr()}/connect`)
      if (resp.status === 201) this.setConnected(WsrxState.Pending)
      else this.setConnected(WsrxState.Connected)
    } catch {
      this.setConnected(WsrxState.Disconnected)
    }
    return this.connected()
  }
  async tryConnect() {
    await ky.post(`${this.apiAddr()}/connect`, {
      json: location.origin,
    })
  }
}

export const wsrx = new Wsrx()
