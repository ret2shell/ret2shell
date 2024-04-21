import { FormStore, Maybe, setValue } from '@modular-forms/solid'
import Input, { TextInputProps } from '@widgets/input'
import { ComponentProps, createEffect, createSignal, splitProps, untrack } from 'solid-js'
import { Captcha } from '@models/captcha'
import Button from '../widgets/button'
import { t } from '../storage/theme'
import { getCaptcha } from '../api/account'
import { encode } from 'js-base64'
import Spin from '../assets/animates/spin'

export default function (
  props: TextInputProps &
    ComponentProps<'input'> & {
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      captchaForm: FormStore<any, undefined>
      idFieldValue: Maybe<string>
      idFieldError: string | undefined
      answerFieldValue: Maybe<string>
      answerFieldError: string | undefined
      timestamp?: number
    }
) {
  const [fieldProps, inputProps] = splitProps(props, ['idFieldValue', 'answerFieldValue'])
  const [captcha, setCaptcha] = createSignal<Captcha | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [calculating, setCalculating] = createSignal(false)
  const [manuallyFill, setManuallyFill] = createSignal(true)

  function reload() {
    setLoading(true)
    getCaptcha()
      .then(resp => {
        setCaptcha(resp)
        if (resp.validator === 'pow') startPow()
        else if (resp.validator === 'none') {
          setValue(props.captchaForm, 'captcha_answer', '0xDEADBEEF')
        }
        setValue(props.captchaForm, 'captcha_id', resp.id)
      })
      .catch(() => {
        setCaptcha(null)
        setValue(props.captchaForm, 'captcha_id', '')
      })
      .finally(() => {
        setLoading(false)
        setValue(props.captchaForm, 'captcha_answer', '')
      })
  }

  createEffect(() => {
    if (props.timestamp) {
      untrack(reload)
    }
  })

  function getCaptchaContent() {
    const captchaObj = captcha()
    if (captchaObj)
      switch (captchaObj.validator) {
        case 'none':
          setManuallyFill(false)
          return <span>NONE</span>
        case 'image':
          setManuallyFill(true)
          return <img class="w-20 object-fill" src={`data:image/svg+xml;base64,${encode(captchaObj.challenge)}`}></img>
        case 'pow':
          setManuallyFill(false)
          return (
            <span class="inline-flex space-x-2 items-center">
              {calculating() ? (
                <>
                  <Spin width={20} height={20}></Spin>
                  <span>{t('captcha.calculating')}</span>
                </>
              ) : (
                <span class="icon-[fluent--checkmark-20-regular] w-5 h-5 text-success"></span>
              )}
            </span>
          )
        case 'recaptcha_v3':
          setManuallyFill(false)
          return <span>ReCaptcha V3</span>
        case 'h_captcha':
          setManuallyFill(false)
          return <span>HCaptcha</span>
      }
  }

  function startPow() {
    setCalculating(true)
    const worker = new Worker(new URL('@lib/workers/pow.worker.ts', import.meta.url), { type: 'module' })
    worker.postMessage({
      challenge: captcha()?.challenge,
    })
    worker.onmessage = e => {
      setCalculating(false)
      setValue(props.captchaForm, 'captcha_answer', e.data)
      worker.terminate()
    }
  }

  return (
    <>
      <input class="hidden" name="captcha_id" value={fieldProps.idFieldValue}></input>
      <Input
        icon={<span class="icon-[fluent--bot-20-regular] w-5 h-5"></span>}
        placeholder={t('captcha.placeholder')}
        title={t('captcha.placeholder')}
        value={fieldProps.answerFieldValue}
        {...inputProps}
        disabled={!manuallyFill()}
        error={props.idFieldError || props.answerFieldError}
        extraBtn={
          <Button
            class="!rounded-l-none"
            loading={loading()}
            onClick={reload}
            disabled={calculating() || loading()}
            type="button"
          >
            {loading() ? t('captcha.loading') : captcha() ? getCaptchaContent() : t('captcha.loadFailed')}
          </Button>
        }
      ></Input>
    </>
  )
}
