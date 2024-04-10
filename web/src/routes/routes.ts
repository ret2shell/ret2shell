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
      path: '/account',
      component: lazy(() => import('./account/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./account/index')),
        },
        {
          path: '/login',
          component: lazy(() => import('./account/login/index')),
        },
        {
          path: '/register',
          component: lazy(() => import('./account/register/index')),
        },
        {
          path: '/forgot',
          component: lazy(() => import('./account/forgot/index')),
        },
        {
          path: '/reset',
          component: lazy(() => import('./account/reset/index')),
        },
        {
          path: '/verify',
          component: lazy(() => import('./account/verify/index')),
        },
        {
          path: '/settings',
          component: lazy(() => import('./account/settings/layout')),
          children: [
            {
              path: '/',
              component: lazy(() => import('./account/settings/index')),
            },
          ],
        },
      ],
    },
    {
      path: '/wiki',
      component: lazy(() => import('./wiki/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./wiki/index')),
        },
      ],
    },
    {
      path: '/training',
      component: lazy(() => import('./training/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./training/index')),
        },
      ],
    },
    {
      path: '/games',
      component: lazy(() => import('./games/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./games/index')),
        },
      ],
    },
    {
      path: '/bulletin',
      component: lazy(() => import('./bulletin/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./bulletin/index')),
        },
      ],
    },
    {
      path: '/admin',
      component: lazy(() => import('./admin/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./admin/index')),
        },
      ],
    },
    {
      path: '/users',
      component: lazy(() => import('./users/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./users/index')),
        },
        {
          path: '/:id',
          component: lazy(() => import('./users/[id]')),
        },
      ],
    },
    {
      path: '/magic',
      component: lazy(() => import('./magic/layout')),
      children: [
        {
          path: '/',
          component: lazy(() => import('./magic/index')),
        },
        {
          path: '/sakana',
          component: lazy(() => import('./magic/sakana/index')),
        },
      ],
    },
  ],
}
