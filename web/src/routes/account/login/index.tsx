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
import { createForm } from '@modular-forms/solid'
import { Title } from '@solidjs/meta'
import { Show, createSignal } from 'solid-js'

type LoginForm = {
  account: string
  password: string
  captcha_id: string
  captcha_answer: string
}

export default function () {
  const [form, { Form, Field, FieldArray }] = createForm<LoginForm>()
  const [authConfig, setAuthConfig] = createSignal({
    signing_key: '',
    buffer_time: 0,
    expires_time: 0,
    oauth_keys: null,
  } as AuthConfig)
  getAuthConfig()
    .then(config => setAuthConfig(config))
    .catch(() => {})
  return (
    <>
      <Title>
        {t('account.login.title')} - {platformStore.config.name || t('platform.name')}
      </Title>
      <div class="flex-1 flex flex-col items-center md:justify-center p-2 md:p-6">
        <Card
          class="w-full max-w-3xl"
          contentClass="p-2 md:p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={() => {}} class="md:w-0 flex-1 flex-shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t('account.login.title')}</h2>
            <Field name="account">
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--person-20-regular] w-5 h-5"></span>}
                  placeholder={t('account.login.accountPlaceholder')}
                  title={t('account.login.accountPlaceholder')}
                  autocomplete="username"
                  {...props}
                  value={field.value}
                />
              )}
            </Field>
            <Field name="password">
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5"></span>}
                  type="password"
                  placeholder={t('account.login.passwordPlaceholder')}
                  title={t('account.login.passwordPlaceholder')}
                  autocomplete="current-password"
                  {...props}
                  value={field.value}
                />
              )}
            </Field>
            <Field name="captcha_id">
              {idField => (
                <Field name="captcha_answer">
                  {(answerField, props) => (
                    <Captcha
                      icon={<span class="icon-[fluent--bot-20-regular] w-5 h-5"></span>}
                      placeholder={t('account.login.captchaPlaceholder')}
                      title={t('account.login.captchaPlaceholder')}
                      {...props}
                      idField={idField.value}
                      answerField={answerField.value}
                    />
                  )}
                </Field>
              )}
            </Field>
            <Button type="submit" level="primary" class="!mt-4">
              {t('account.login.title')}
            </Button>
          </Form>
          <Divider class="md:hidden" />
          <Divider class="hidden md:inline-block" direction="vertical" />
          <div class="md:w-0 flex-1 flex-shrink-0 flex flex-col items-center space-y-2">
            <div class="flex-1 flex items-center justify-center">
              <LogoAnimate class="w-36 h-36 hidden md:inline-block my-6" />
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
