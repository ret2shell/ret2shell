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
          path: '/oauth',
          component: lazy(() => import('./account/oauth/index')),
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
            {
              path: '/info',
              component: lazy(() => import('./account/settings/info/index')),
            },
            {
              path: '/oauth',
              component: lazy(() => import('./account/settings/oauth/index')),
            },
            {
              path: '/institute',
              component: lazy(() => import('./account/settings/institute/index')),
            },
            {
              path: '/mov-rsp-rbp-pop-rbp',
              component: lazy(() => import('./account/settings/mov-rsp-rbp-pop-rbp/index')),
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
        {
          path: '/create',
          component: lazy(() => import('./wiki/create/index')),
        },
        {
          path: '/:article',
          component: lazy(() => import('./wiki/[article]/index')),
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
        {
          path: '/:game',
          component: lazy(() => import('./training/[game]/index')),
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
        {
          path: '/:game',
          component: lazy(() => import('./games/[game]/layout')),
          children: [
            {
              path: '/',
              component: lazy(() => import('./games/[game]/index')),
            },
            {
              path: '/writeups',
              component: lazy(() => import('./games/[game]/writeups/layout')),
              children: [
                {
                  path: '/',
                  component: lazy(() => import('./games/[game]/writeups/index')),
                },
                {
                  path: '/edit',
                  component: lazy(() => import('./games/[game]/writeups/edit/index')),
                },
                {
                  path: '/:writeup',
                  component: lazy(() => import('./games/[game]/writeups/[writeup]/index')),
                },
              ],
            },
            {
              path: '/admin',
              component: lazy(() => import('./games/[game]/admin/layout')),
              children: [
                {
                  path: '/',
                  component: lazy(() => import('./games/[game]/admin/index')),
                },
                {
                  path: '/statistics',
                  component: lazy(() => import('./games/[game]/admin/statistics/index')),
                },
                {
                  path: '/events',
                  component: lazy(() => import('./games/[game]/admin/events/index')),
                },
                {
                  path: '/teams',
                  component: lazy(() => import('./games/[game]/admin/teams/index')),
                },
                {
                  path: '/automate',
                  component: lazy(() => import('./games/[game]/admin/automate/index')),
                },
                {
                  path: '/edit',
                  component: lazy(() => import('./games/[game]/admin/edit/index')),
                },
              ],
            },
            {
              path: '/scoreboard',
              component: lazy(() => import('./games/[game]/scoreboard/index')),
            },
            {
              path: '/challenges',
              component: lazy(() => import('./games/[game]/challenges/index')),
            },
            {
              path: '/teams',
              children: [
                {
                  path: '/',
                  component: lazy(() => import('./games/[game]/teams/index')),
                },
                {
                  path: '/:team',
                  component: lazy(() => import('./games/[game]/teams/[team]/index')),
                },
                {
                  path: '/create',
                  component: lazy(() => import('./games/[game]/teams/create/index')),
                },
                {
                  path: '/join',
                  component: lazy(() => import('./games/[game]/teams/join/index')),
                },
              ],
            },
          ],
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
        {
          path: '/create',
          component: lazy(() => import('./bulletin/create')),
        },
        {
          path: '/:article',
          component: lazy(() => import('./bulletin/[article]/index')),
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
        {
          path: '/users',
          component: lazy(() => import('./admin/users/index')),
        },
        {
          path: '/statistics',
          component: lazy(() => import('./admin/statistics/index')),
        },
        {
          path: '/captcha',
          component: lazy(() => import('./admin/captcha/index')),
        },
        {
          path: '/email',
          component: lazy(() => import('./admin/email/index')),
        },
        {
          path: '/edit',
          component: lazy(() => import('./admin/edit/index')),
        },
        {
          path: '/logs',
          component: lazy(() => import('./admin/logs/index')),
        },
        {
          path: '/cluster',
          component: lazy(() => import('./admin/cluster/index')),
        },
        {
          path: '/sync',
          component: lazy(() => import('./admin/sync/index')),
        },
        {
          path: '/media',
          component: lazy(() => import('./admin/media/index')),
        },
        {
          path: '/oauth',
          component: lazy(() => import('./admin/oauth/index')),
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
          path: '/:user',
          component: lazy(() => import('./users/[user]/index')),
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
    {
      path: '/errors',
      children: [
        {
          path: '/401',
          component: lazy(() => import('./errors/e401')),
        },
        {
          path: '/403',
          component: lazy(() => import('./errors/e403')),
        },
        {
          path: '/404',
          component: lazy(() => import('./errors/e404')),
        },
        {
          path: '/418',
          component: lazy(() => import('./errors/e418')),
        },
        {
          path: '/500',
          component: lazy(() => import('./errors/e500')),
        },
        {
          path: '/502',
          component: lazy(() => import('./errors/e502')),
        },
      ],
    },
    {
      path: '*',
      component: lazy(() => import('./errors/e404')),
    },
  ],
}
