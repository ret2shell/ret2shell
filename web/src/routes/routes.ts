import { lazy } from 'solid-js'

export const routes = {
  path: '/',
  component: lazy(() => import('./layout')),
  children: [
    {
      path: '/',
      component: lazy(() => import('./index')),
    },
    {
      path: '/wiki',
      component: lazy(() => import('./wiki')),
    },
  ],
}
