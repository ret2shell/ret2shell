import { HostType } from '@/lib/models/game'
import { t } from '@/lib/storage/theme'
import Input from '@/lib/widgets/input'
import TimePicker from '@/lib/widgets/timepicker'
import { createForm, required } from '@modular-forms/solid'
import { DateTime } from 'luxon'

type CreateGameForm = {
  name: string
  brief: string
  start_at: number
  end_at: number
  register_at: number
  archive_at: number
  offline: boolean
  host_type: HostType
  team_size: number
  enable_audit: boolean
  can_register_after_started: boolean
  weight: number
}

export default function CreateGame() {
  const [form, { Form, Field }] = createForm<CreateGameForm>()
  function onSubmit(result: CreateGameForm) {}
  return (
    <>
      <div class="flex-1 self-center w-full max-w-5xl flex flex-col">
        <h1 class="text-3xl text-center font-bold mt-8">
          {t('game.create')} - {t('game.title')}
        </h1>
        <Form onSubmit={onSubmit} class="flex flex-col space-y-2 py-3 lg:py-6">
          <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
            <Field name="name" validate={[required(t('game.nameRequired')!)]}>
              {(field, props) => (
                <>
                  <Input
                    icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5"></span>}
                    placeholder={t('game.namePlaceholder')}
                    title={t('game.namePlaceholder')}
                    {...props}
                    value={field.value}
                    error={field.error}
                    required
                    class="flex-1"
                  />
                </>
              )}
            </Field>
          </div>
          <Field name="brief" validate={[required(t('game.briefRequired')!)]}>
            {(field, props) => (
              <>
                <Input
                  icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5"></span>}
                  placeholder={t('game.briefPlaceholder')}
                  title={t('game.briefPlaceholder')}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                  class="flex-1"
                />
              </>
            )}
          </Field>
          <Field name="start_at" type="number">
            {startAtField => (
              <Field name="end_at" type="number">
                {endAtField => (
                  <Field name="register_at" type="number">
                    {registerAtField => (
                      <Field name="archive_at" type="number">
                        {archiveAtField => (
                          <>
                            <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                              <TimePicker
                                class="flex-1"
                                form={form}
                                type="time"
                                range
                                title={t('game.startEndTime')}
                                placeholder={t('game.startEndTime')}
                                name={startAtField.name}
                                value={startAtField.value}
                                nameNext={endAtField.name}
                                valueNext={endAtField.value}
                                error={startAtField.error || endAtField.error}
                                startEdge={
                                  (registerAtField.value && DateTime.fromSeconds(registerAtField.value)) || undefined
                                }
                                endEdge={
                                  (archiveAtField.value && DateTime.fromSeconds(archiveAtField.value)) || undefined
                                }
                              />
                              <TimePicker
                                class="flex-1"
                                form={form}
                                type="time"
                                range
                                title={t('game.registerArchiveTime')}
                                placeholder={t('game.registerArchiveTime')}
                                name={registerAtField.name}
                                value={registerAtField.value}
                                nameNext={archiveAtField.name}
                                valueNext={archiveAtField.value}
                                error={registerAtField.error || archiveAtField.error}
                                startEdge={
                                  (startAtField.value && DateTime.fromSeconds(startAtField.value)) || undefined
                                }
                                endEdge={(endAtField.value && DateTime.fromSeconds(endAtField.value)) || undefined}
                                reverseEdge
                              />
                            </div>
                          </>
                        )}
                      </Field>
                    )}
                  </Field>
                )}
              </Field>
            )}
          </Field>
        </Form>
      </div>
    </>
  )
}
