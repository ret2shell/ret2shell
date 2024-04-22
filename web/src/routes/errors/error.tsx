import { t } from '@/lib/storage/theme'

export default function (props: { status: number | null }) {
  const messages: Record<number, string> = {
    401: t('errors.401')!,
    403: t('errors.403')!,
    404: t('errors.404')!,
    418: t('errors.418')!,
    500: t('errors.500')!,
    502: t('errors.502')!,
  }

  const tips: Record<number, string> = {
    401: t('errors.401Tip')!,
    403: t('errors.403Tip')!,
    404: t('errors.404Tip')!,
    418: t('errors.418Tip')!,
    500: t('errors.500Tip')!,
    502: t('errors.502Tip')!,
  }

  const message = () => messages[props.status!] || t('errors.unknown')!
  const tip = () => tips[props.status!] || t('errors.unknownTip')!

  return (
    <div class="flex-1 flex flex-col items-center justify-center">
      <h1 class="font-bold text-3xl space-x-4">
        <span class="opacity-60">{props.status}</span>
        <span class="text-primary">|</span>
        <span>{message()}</span>
      </h1>
      <p class="opacity-60 mt-8">{tip()}</p>
    </div>
  )
}
