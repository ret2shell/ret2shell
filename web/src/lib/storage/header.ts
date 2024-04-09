import { createEffect } from 'solid-js'
import { t } from './theme'
import { platformStore } from './platform'
import { useLocation } from '@solidjs/router'

class RouteHeader {
  title: string
  path: string
  subRoutes: RouteHeader[]
  constructor() {
    this.title = ''
    this.path = ''
    this.subRoutes = []
  }

  findRoute(subPath: string[]): [RouteHeader, RouteHeader | null] {
    if (subPath.length === 0) {
      return [this, this]
    }
    const subRoute = this.subRoutes.find(r => r.path === subPath[0])
    if (subRoute) {
      return subRoute.findRoute(subPath.slice(1))
    }
    return [this, null]
  }

  insertRoute(subPath: string[], title: string) {
    if (subPath.length === 0) {
      this.title = title
      return
    }
    const subRoute = this.subRoutes.find(r => r.path === subPath[0])
    if (subRoute) {
      subRoute.insertRoute(subPath.slice(1), title)
    } else {
      const newRoute = new RouteHeader()
      newRoute.path = subPath[0]
      newRoute.insertRoute(subPath.slice(1), title)
      this.subRoutes.push(newRoute)
    }
  }
}

export const headerStore = new RouteHeader()

export function Title(props: { title: string }) {
  const path = useLocation().pathname
  const pathArr = path.split('/')
  const [, exactRoute] = headerStore.findRoute(pathArr)
  if (exactRoute) {
    exactRoute.title = props.title
  } else {
    headerStore.insertRoute(pathArr, props.title)
  }
  document.title = props.title
  return null
}

export function setupTitleResolver() {
  createEffect(() => {
    const path = useLocation().pathname
    const pathArr = path.split('/')
    const [parentRoute, exactRoute] = headerStore.findRoute(pathArr)
    document.title = exactRoute?.title || parentRoute.title || platformStore.config.name || t('platform.name')!
  })
}
