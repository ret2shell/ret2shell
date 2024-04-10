import { getAuthConfig } from '@/lib/api/platform'
import LogoAnimate from '@/lib/assets/animates/logo-animate'
import Github from '@/lib/assets/brands/github'
import Gitlab from '@/lib/assets/brands/gitlab'
import Google from '@/lib/assets/brands/google'
import Captcha from '@/lib/blocks/captcha'
import { AuthConfig } from '@/lib/models/config'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Divider from '@/lib/widgets/divider'
import Input from '@/lib/widgets/input'
import Link from '@/lib/widgets/link'
import { createForm, minLength, pattern, required, setValue } from '@modular-forms/solid'
import { Title } from '@storage/header'
import { Match, Show, Switch, createSignal } from 'solid-js'
import xdsecMascotNormal from '@assets/imgs/xdsec-mascot-normal.webp'
import xdsecMascotUnsee from '@assets/imgs/xdsec-mascot-unsee.webp'
import xdsecMascotHappy from '@assets/imgs/xdsec-mascot-happy.webp'
import xdsecMascotCrying from '@assets/imgs/xdsec-mascot-crying.webp'
import { login } from '@/lib/api/account'
import { addToast } from '@/lib/storage/toast'
import { HTTPError } from 'ky'
import { useLocation, useNavigate } from '@solidjs/router'
import { DateTime } from 'luxon'
import { accountStore } from '@/lib/storage/account'

type LoginForm = {
  account: string
  password: string
  captcha_id: string
  captcha_answer: string
}

export default function () {
  const navigate = useNavigate()
  const location = useLocation()
  if (accountStore.token) {
    navigate('/', { replace: true })
    return null
  }
  const [form, { Form, Field }] = createForm<LoginForm>()
  const [authConfig, setAuthConfig] = createSignal({
    signing_key: '',
    buffer_time: 0,
    expires_time: 0,
    oauth_keys: null,
  } as AuthConfig)
  getAuthConfig()
    .then(config => setAuthConfig(config))
    .catch(() => {})
  const [mascot, setMascot] = createSignal(null as string | null)
  const [loading, setLoading] = createSignal(false)
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis())
  function handleLogin(result: LoginForm) {
    setLoading(true)
    login(result)
      .then(() => {
        addToast({ level: 'success', description: t('account.login.success')!, duration: 5000, img: xdsecMascotHappy })
        const redirectUrl = location.query['redirect']
        if (redirectUrl) {
          navigate(redirectUrl as string, { replace: true })
        } else {
          navigate('/', { replace: true })
        }
      })
      .catch((err: HTTPError) => {
        err.response.text().then(text => {
          addToast({ level: 'error', description: text as string, duration: 5000 })
        })
        setTimestamp(DateTime.now().toMillis())
        setValue(form, 'password', '')
        setTimeout(() => {
          setMascot(xdsecMascotCrying)
        }, 500)
      })
      .finally(() => {
        setLoading(false)
      })
  }
  return (
    <>
      <Title title={`${t('account.login.title')} - ${platformStore.config.name || t('platform.name')}`} />
      <div class="flex-1 flex flex-col items-center md:justify-center p-2 md:p-6">
        <Card
          class="w-full max-w-3xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={handleLogin} class="md:w-0 flex-1 flex-shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t('account.login.title')}</h2>
            <Field
              name="account"
              validate={[
                required(t('account.login.accountRequired')!),
                minLength(4, t('account.login.accountMinLength')!),
              ]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--person-20-regular] w-5 h-5"></span>}
                  placeholder={t('account.login.accountPlaceholder')}
                  title={t('account.login.accountPlaceholder')}
                  autocomplete="username"
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                  onFocusIn={() => {
                    setMascot(xdsecMascotNormal)
                  }}
                  onFocusOut={() => {
                    setMascot(null)
                  }}
                />
              )}
            </Field>
            <Field
              name="password"
              validate={[
                required(t('account.login.passwordRequired')!),
                minLength(8, t('account.login.passwordMinLength')!),
                pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^]{8,64}$/, t('account.login.passwordTooWeak')!),
              ]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5"></span>}
                  type="password"
                  placeholder={t('account.login.passwordPlaceholder')}
                  title={t('account.login.passwordPlaceholder')}
                  autocomplete="current-password"
                  {...props}
                  value={field.value}
                  error={field.error}
                  onFocusIn={() => {
                    setMascot(xdsecMascotUnsee)
                  }}
                  onFocusOut={() => {
                    setMascot(null)
                  }}
                />
              )}
            </Field>
            <Field name="captcha_id">
              {idField => (
                <Field
                  name="captcha_answer"
                  validate={[required(t('captcha.required')!), minLength(4, t('captcha.minLength')!)]}
                >
                  {(answerField, props) => (
                    <Captcha
                      {...props}
                      captchaForm={form}
                      idFieldValue={idField.value}
                      idFieldError={idField.error}
                      answerFieldValue={answerField.value}
                      answerFieldError={answerField.error}
                      timestamp={timestamp()}
                    />
                  )}
                </Field>
              )}
            </Field>
            <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
              {t('account.login.title')}
            </Button>
          </Form>
          <Divider class="md:hidden" />
          <Divider class="hidden md:inline-block" direction="vertical" />
          <div class="md:w-0 flex-1 flex-shrink-0 flex flex-col items-center space-y-2">
            <div class="flex-1 flex flex-col items-center justify-center">
              <Switch fallback={<LogoAnimate class="w-36 h-36 hidden md:inline-block my-6" />}>
                <Match when={mascot() === xdsecMascotNormal}>
                  <img
                    src={xdsecMascotNormal}
                    class="w-36 h-36 hidden md:inline-block my-6"
                    alt="Illustrated by hypnotics"
                    title="Illustrated by hypnotics"
                  />
                  <label>{t('account.login.accountMascotTip')}</label>
                </Match>
                <Match when={mascot() === xdsecMascotUnsee}>
                  <img
                    src={xdsecMascotUnsee}
                    class="w-36 h-36 hidden md:inline-block my-6"
                    alt="Illustrated by hypnotics"
                    title="Illustrated by hypnotics"
                  />
                  <label>{t('account.login.passwordMascotTip')}</label>
                </Match>
                <Match when={mascot() === xdsecMascotHappy}>
                  <img
                    src={xdsecMascotHappy}
                    class="w-36 h-36 hidden md:inline-block my-6"
                    alt="Illustrated by hypnotics"
                    title="Illustrated by hypnotics"
                  />
                  <label>{t('account.login.successMascotTip')}</label>
                </Match>
                <Match when={mascot() === xdsecMascotCrying}>
                  <img
                    src={xdsecMascotCrying}
                    class="w-36 h-36 hidden md:inline-block my-6"
                    alt="Illustrated by hypnotics"
                    title="Illustrated by hypnotics"
                  />
                  <label>{t('account.login.failMascotTip')}</label>
                </Match>
              </Switch>
            </div>
            <Link class="w-full" href="/account/register">
              {t('account.register.tips')}
            </Link>
            <Show when={authConfig().oauth_keys !== null && (authConfig().oauth_keys?.length || 0) > 0}>
              <div class="flex flex-row flex-wrap space-x-2 items-start w-full">
                <Show when={(authConfig().oauth_keys || []).find(s => s.service === 'xdu')}>
                  <Link href="/account/oauth?type=redirect&service=xdu" class="flex-1">
                    <span>{t('account.oauth.xdu.title')}</span>
                  </Link>
                </Show>
                <Show when={(authConfig().oauth_keys || []).find(s => s.service === 'google')}>
                  <Link href="/account/oauth?type=redirect&service=google" square>
                    <Google width={24} height={24} />
                  </Link>
                </Show>
                <Show when={(authConfig().oauth_keys || []).find(s => s.service === 'github')}>
                  <Link href="/account/oauth?type=redirect&service=github" square>
                    <Github width={24} height={24} />
                  </Link>
                </Show>
                <Show when={(authConfig().oauth_keys || []).find(s => s.service === 'gitlab')}>
                  <Link href="/account/oauth?type=redirect&service=gitlab" square>
                    <Gitlab width={24} height={24} />
                  </Link>
                </Show>
              </div>
            </Show>
          </div>
        </Card>
      </div>
    </>
  )
}
