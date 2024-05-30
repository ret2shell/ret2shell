import { register } from '@/lib/api/account'
import Captcha from '@/lib/blocks/captcha'
import { Title } from '@/lib/storage/header'
import { platformStore } from '@/lib/storage/platform'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Input from '@/lib/widgets/input'
import { createForm, email, maxLength, minLength, pattern, required, setValue } from '@modular-forms/solid'
import { HTTPError } from '@reverier/ky'
import { DateTime } from 'luxon'
import { createSignal } from 'solid-js'
import xdsecMascotHappy from '@assets/imgs/xdsec-mascot-happy.webp'
import { useNavigate } from '@solidjs/router'
import { accountStore } from '@/lib/storage/account'
import { deunicode, leet } from '@/lib/api/rpc'

type RegisterForm = {
  account: string
  nickname: string
  email: string
  password: string
  captcha_id: string
  captcha_answer: string
}

export default function () {
  const navigate = useNavigate()
  if (accountStore.token) {
    navigate('/', { replace: true })
    return null
  }
  const [form, { Form, Field }] = createForm<RegisterForm>()
  const [loading, setLoading] = createSignal(false)
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis())
  let accountInputRef: HTMLInputElement
  return (
    <>
      <Title title={`${t('account.register.title')} - ${platformStore.config.name || t('platform.name')}`} />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-3xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form
            onSubmit={result => {
              setLoading(true)
              register(result)
                .then(() => {
                  addToast({
                    level: 'success',
                    description: t('account.register.success')!,
                    duration: 5000,
                    img: xdsecMascotHappy,
                  })
                  navigate('/', { replace: true })
                })
                .catch((err: HTTPError) => {
                  void err.response.text().then(text => {
                    addToast({ level: 'error', description: text, duration: 5000 })
                  })
                  setTimestamp(DateTime.now().toMillis())
                })
                .finally(() => {
                  setLoading(false)
                })
            }}
            class="md:w-0 flex-1 flex-shrink-0 flex flex-col space-y-2"
          >
            <h2 class="font-bold text-center">{t('account.register.title')}</h2>
            <div class="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
              <Field
                name="nickname"
                validate={[
                  required(t('account.register.nicknameRequired')!),
                  minLength(2, t('account.register.nicknameMinLength')!),
                  maxLength(32, t('account.register.nicknameMaxLength')!),
                ]}
              >
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--wand-20-regular] w-5 h-5"></span>}
                    placeholder={t('account.register.nicknamePlaceholder')}
                    title={t('account.register.nicknamePlaceholder')}
                    autocomplete="nickname"
                    {...props}
                    value={field.value}
                    error={field.error}
                    class="flex-1"
                    required
                    onBlur={e => {
                      if (e.target.value)
                        deunicode(e.target.value)
                          .then(result => {
                            setValue(form, 'account', result)
                          })
                          .catch(() => {})
                    }}
                  />
                )}
              </Field>
              <Field
                name="account"
                validate={[
                  required(t('account.register.accountRequired')!),
                  minLength(4, t('account.register.accountMinLength')!),
                  maxLength(32, t('account.register.accountMaxLength')!),
                  // only ascii visible characters, no whitespaces
                  pattern(/^[0-9a-zA-Z_]*$/, t('account.register.accountPattern')!),
                ]}
              >
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--person-20-regular] w-5 h-5"></span>}
                    placeholder={t('account.register.accountPlaceholder')}
                    title={t('account.register.accountPlaceholder')}
                    autocomplete="username"
                    {...props}
                    value={field.value}
                    error={field.error}
                    class="flex-1"
                    required
                    ref={accountInputRef}
                    extraBtn={
                      <Button
                        class="!rounded-l-none"
                        type="button"
                        onClick={() => {
                          if (accountInputRef?.value)
                            leet(accountInputRef!.value)
                              .then(result => {
                                setValue(form, 'account', result)
                              })
                              .catch(() => {})
                        }}
                      >
                        <span class="icon-[fluent--diversity-20-regular] w-5 h-5"></span>
                      </Button>
                    }
                  />
                )}
              </Field>
            </div>
            <Field
              name="email"
              validate={[required(t('account.register.emailRequired')!), email(t('account.register.emailInvalid')!)]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5"></span>}
                  placeholder={t('account.register.emailPlaceholder')}
                  title={t('account.register.emailPlaceholder')}
                  autocomplete="email"
                  {...props}
                  value={field.value}
                  error={field.error}
                  class="flex-1"
                  required
                />
              )}
            </Field>
            <div class="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
              <Field
                name="password"
                validate={[
                  required(t('account.register.passwordRequired')!),
                  minLength(8, t('account.register.passwordMinLength')!),
                  pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^]{8,40}$/, t('account.register.passwordTooWeak')!),
                ]}
              >
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5"></span>}
                    placeholder={t('account.register.passwordPlaceholder')}
                    title={t('account.register.passwordPlaceholder')}
                    autocomplete="password"
                    type="password"
                    {...props}
                    value={field.value}
                    error={field.error}
                    class="flex-1"
                    required
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
                        class="flex-1"
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
            </div>
            <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
              {t('account.register.title')}
            </Button>
          </Form>
        </Card>
      </div>
    </>
  )
}
