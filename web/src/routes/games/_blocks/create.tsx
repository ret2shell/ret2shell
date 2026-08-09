import { useCreateGameMutation, useGames } from "@api/game";
import { type Game, HostType } from "@models/game";
import { createForm, maxRange, minRange, required, setValue } from "@modular-forms/solid";
import { useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import IconCheckbox from "@widgets/icon-checkbox";
import Input from "@widgets/input";
import TimePicker from "@widgets/timepicker";
import clsx from "clsx";
import { DateTime } from "luxon";
import { createMemo } from "solid-js";

type CreateGameForm = {
  name: string;
  brief: string;
  start_at: number;
  end_at: number;
  register_at: number;
  archive_at: number;
  offline: boolean;
  team_size: number;
  env_limit?: number;
  enable_audit: boolean;
  can_register_after_started: boolean;
  weight: number;
};

export default function CreateGame(props: { onDone: (game: Game) => void }) {
  const [searchParams] = useSearchParams();
  const keyPage = createMemo(() => {
    const result = searchParams["key-page"] ? Number.parseInt(searchParams["key-page"] as string, 10) : 1;
    if (Number.isNaN(result) || result < 1) {
      return 1;
    }
    return result;
  });
  const keyGames = useGames({
    page: () => keyPage(),
    page_size: () => 5,
    host_type: () => HostType.Game,
    weight: () => 3,
    enabled: () => true,
  });
  const othersPage = createMemo(() => {
    const result = searchParams["other-page"] ? Number.parseInt(searchParams["other-page"] as string, 10) : 1;
    if (Number.isNaN(result) || result < 1) {
      return 1;
    }
    return result;
  });
  const otherGames = useGames({
    page: () => othersPage(),
    page_size: () => 20,
    host_type: () => HostType.Game,
    weight: () => 1,
    enabled: () => true,
  });
  const [form, { Form, Field }] = createForm<CreateGameForm>({
    initialValues: {
      weight: 3,
      team_size: 4,
      offline: false,
      enable_audit: true,
      can_register_after_started: true,
    },
  });
  const mutation = useCreateGameMutation({
    onSuccess: (data) => {
      keyGames.refetch();
      otherGames.refetch();
      props.onDone(data);
    },
  });
  async function onSubmit(result: CreateGameForm) {
    const req: Game = {
      ...result,
      env_limit: result.env_limit ?? null,
      start_at: DateTime.fromSeconds(result.start_at),
      end_at: DateTime.fromSeconds(result.end_at),
      register_at: DateTime.fromSeconds(result.register_at),
      archive_at: DateTime.fromSeconds(result.archive_at),
      host_type: HostType.Game,
      id: 0,
      hidden: true,
      frozen: false,
      updated_at: DateTime.now(),
      introduction_id: null,
      access_policy: { restrict: false, institutes: [], sync: 2 },
      cover: null,
      logo: null,
      award_rate: 0,
      admins: [accountStore.id!],
      token: null,
      timeline_presets: [],
      award_rates: [0, 0, 0],
      node_selector: null,
      traffic: null,
      lifecycle: null,
      bucket: null,
      archive_policy: { challenge: { show_answer: false, show_hints: false } },
      hammer_policy: {
        enabled: true,
        outer_label: null,
        outer_url: null,
      },
    };
    mutation.mutate(req);
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col self-center w-full max-w-5xl space-y-2">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("game.form.title")}</span>
      </h3>
      <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
        <Field name="name" validate={[required(t("game.form.name.required"))]}>
          {(field, props) => (
            <Input
              icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
              placeholder={t("game.form.name.placeholder")}
              title={t("game.form.name.label")}
              {...props}
              value={field.value}
              error={field.error}
              required
              class="flex-1"
            />
          )}
        </Field>
        <Field
          name="team_size"
          type="number"
          validate={[
            required(t("game.form.teamSize.required")),
            minRange(0, t("game.form.teamSize.minimum")),
            maxRange(99, t("game.form.teamSize.maximum")),
          ]}
        >
          {(field, props) => (
            <Input
              icon={<span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />}
              placeholder={t("game.form.teamSize.placeholder")}
              title={t("game.form.teamSize.label")}
              {...props}
              value={field.value}
              type="number"
              error={field.error}
              required
              class="min-w-48"
              min={0}
              max={99}
            />
          )}
        </Field>
        <Field
          name="env_limit"
          type="number"
          validate={[minRange(1, t("game.form.envLimit.minimum")), maxRange(99, t("game.form.envLimit.maximum"))]}
        >
          {(field, props) => (
            <Input
              icon={<span class="shrink-0 icon-[fluent--box-20-regular] w-5 h-5" />}
              placeholder={t("game.form.envLimit.placeholder")}
              title={t("game.form.envLimit.label")}
              {...props}
              value={field.value}
              type="number"
              error={field.error}
              class="min-w-48"
              min={1}
              max={99}
            />
          )}
        </Field>
        <div class="flex flex-col space-y-1">
          <header class="label">{t("game.miscSettings")}</header>
          <div class="flex flex-row">
            <Field name="can_register_after_started" type="boolean">
              {(field, props) => (
                <IconCheckbox
                  class="rounded-r-none!"
                  title={t("game.form.canRegisterAfterStart.label")}
                  uncheckedIcon="icon-[fluent--accessibility-checkmark-20-regular]"
                  checkedIcon="icon-[fluent--accessibility-checkmark-20-filled]"
                  inputProps={props}
                  checked={field.value}
                  error={field.error}
                  name="can_register_after_started"
                />
              )}
            </Field>
            <Field name="offline" type="boolean">
              {(field, props) => (
                <IconCheckbox
                  class="rounded-none!"
                  title={t("game.form.offline.label")}
                  uncheckedIcon="icon-[fluent--wifi-off-20-regular]"
                  checkedIcon="icon-[fluent--wifi-off-20-filled]"
                  inputProps={props}
                  checked={field.value}
                  error={field.error}
                  name="offline"
                />
              )}
            </Field>
            <Field name="enable_audit" type="boolean">
              {(field, props) => (
                <IconCheckbox
                  class="rounded-l-none!"
                  title={t("game.form.enableTeamAudit.label")}
                  uncheckedIcon="icon-[fluent--people-audience-20-regular]"
                  checkedIcon="icon-[fluent--people-audience-20-filled]"
                  inputProps={props}
                  checked={field.value}
                  error={field.error}
                  name="enable_audit"
                />
              )}
            </Field>
          </div>
        </div>
        <Field name="weight" type="number">
          {(field, props) => (
            <div class="flex flex-col space-y-1">
              <label class="label" for={props.name}>
                {t("game.form.weight.label")}
                <input class="hidden" type="number" {...props} value={field.value} />
              </label>
              <div class="flex flex-row">
                <Button
                  type="button"
                  square
                  class={clsx("rounded-r-none!", field.value === 1 && "text-primary")}
                  onClick={() => {
                    setValue(form, "weight", 1);
                  }}
                >
                  1
                </Button>
                <Button
                  type="button"
                  square
                  class={clsx("rounded-none!", field.value === 2 && "text-primary")}
                  onClick={() => {
                    setValue(form, "weight", 2);
                  }}
                >
                  2
                </Button>
                <Button
                  type="button"
                  square
                  class={clsx("rounded-l-none!", field.value === 3 && "text-primary")}
                  onClick={() => {
                    setValue(form, "weight", 3);
                  }}
                >
                  3
                </Button>
              </div>
            </div>
          )}
        </Field>
      </div>
      <Field name="brief" validate={[required(t("game.form.brief.required"))]}>
        {(field, props) => (
          <Input
            icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
            placeholder={t("game.form.brief.placeholder")}
            title={t("game.form.brief.label")}
            {...props}
            value={field.value}
            error={field.error}
            required
            class="flex-1"
          />
        )}
      </Field>
      <Field name="start_at" type="number" validate={[required(t("game.form.startAt.required"))]}>
        {(startAtField) => (
          <Field name="end_at" type="number" validate={[required(t("game.form.endAt.required"))]}>
            {(endAtField) => (
              <Field name="register_at" type="number" validate={[required(t("game.form.registerAt.required"))]}>
                {(registerAtField) => (
                  <Field name="archive_at" type="number" validate={[required(t("game.form.archiveAt.required"))]}>
                    {(archiveAtField) => (
                      <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                        <TimePicker
                          class="flex-1"
                          form={form}
                          type="time"
                          range
                          title={`${t("game.form.startAt.label")} - ${t("game.form.endAt.label")}`}
                          name={startAtField.name}
                          value={startAtField.value}
                          nameNext={endAtField.name}
                          valueNext={endAtField.value}
                          error={startAtField.error || endAtField.error}
                          startEdge={
                            (registerAtField.value && DateTime.fromSeconds(registerAtField.value)) || undefined
                          }
                          endEdge={(archiveAtField.value && DateTime.fromSeconds(archiveAtField.value)) || undefined}
                        />
                        <TimePicker
                          class="flex-1"
                          form={form}
                          type="time"
                          range
                          title={`${t("game.form.registerAt.label")} - ${t("game.form.archiveAt.label")}`}
                          name={registerAtField.name}
                          value={registerAtField.value}
                          nameNext={archiveAtField.name}
                          valueNext={archiveAtField.value}
                          error={registerAtField.error || archiveAtField.error}
                          startEdge={(startAtField.value && DateTime.fromSeconds(startAtField.value)) || undefined}
                          endEdge={(endAtField.value && DateTime.fromSeconds(endAtField.value)) || undefined}
                          reverseEdge
                        />
                      </div>
                    )}
                  </Field>
                )}
              </Field>
            )}
          </Field>
        )}
      </Field>
      <Button type="submit" level="primary" class="mt-4!" loading={mutation.isPending} disabled={mutation.isPending}>
        {t("general.actions.create.title")}
      </Button>
    </Form>
  );
}
