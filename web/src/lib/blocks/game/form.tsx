import { useGame } from "@api/game";
import { createForm, maxRange, minRange, required, setValues } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import Slider from "@widgets/slider";
import TimePicker from "@widgets/timepicker";
import { DateTime } from "luxon";
import { createMemo, Show } from "solid-js";

export type GameForm = {
  name: string;
  brief: string;
  start_at?: number;
  end_at?: number;
  register_at?: number;
  archive_at?: number;
  hidden: boolean;
  offline?: boolean;
  frozen?: boolean;
  team_size?: number;
  enable_audit?: boolean;
  can_register_after_started?: boolean;
  award_rate?: number;
  first_blood_award?: number;
  second_blood_award?: number;
  third_blood_award?: number;
  enable_hammer?: boolean;
  outer_hammer_label?: string;
  outer_hammer_url?: string;
};

export default function GameEdit(props: {
  onDone: (result: GameForm) => Promise<void>;
  gameId?: number;
  training?: boolean;
}) {
  const game = useGame({ id: () => props.gameId ?? -1, enabled: () => !!props.gameId });
  const [form, { Form, Field }] = createForm<GameForm>({
    initialValues: {
      ...game.data,
      start_at: game.data?.start_at.toSeconds(),
      end_at: game.data?.end_at.toSeconds(),
      register_at: game.data?.register_at.toSeconds(),
      archive_at: game.data?.archive_at.toSeconds(),
      first_blood_award: game.data?.award_rates?.[0] || game.data?.award_rate || 0,
      second_blood_award: Math.floor(game.data?.award_rates?.[1] || ((game.data?.award_rate || 0) * 2) / 3),
      third_blood_award: Math.floor(game.data?.award_rates?.[2] || (game.data?.award_rate || 0) / 3),
      enable_hammer: game.data?.hammer_policy?.enabled || false,
      outer_hammer_label: game.data?.hammer_policy?.outer_label || "",
      outer_hammer_url: game.data?.hammer_policy?.outer_url || "",
    },
  });
  const remoteValues = createMemo<GameForm>(() => ({
    name: game.data?.name || "",
    brief: game.data?.brief || "",
    start_at: game.data?.start_at?.toSeconds(),
    end_at: game.data?.end_at?.toSeconds(),
    register_at: game.data?.register_at?.toSeconds(),
    archive_at: game.data?.archive_at?.toSeconds(),
    hidden: game.data?.hidden || false,
    offline: game.data?.offline || false,
    frozen: game.data?.frozen || false,
    team_size: game.data?.team_size,
    enable_audit: game.data?.enable_audit || false,
    can_register_after_started: game.data?.can_register_after_started || false,
    award_rate: game.data?.award_rate,
    first_blood_award: game.data?.award_rates?.[0] || game.data?.award_rate || 0,
    second_blood_award: Math.floor(game.data?.award_rates?.[1] || ((game.data?.award_rate || 0) * 2) / 3),
    third_blood_award: Math.floor(game.data?.award_rates?.[2] || (game.data?.award_rate || 0) / 3),
    enable_hammer: game.data?.hammer_policy?.enabled || false,
    outer_hammer_label: game.data?.hammer_policy?.outer_label || "",
    outer_hammer_url: game.data?.hammer_policy?.outer_url || "",
  }));
  const draft = useFormDraft({
    form,
    key: () =>
      props.gameId ? buildFormDraftKey("games", props.gameId, props.training ? "training-form" : "form") : undefined,
    remoteValues,
    enabled: () => !!props.gameId && !!game.data,
  });

  async function onSubmit(result: GameForm) {
    await props.onDone(result);
    draft.discardDraft();
  }

  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-full max-w-5xl space-y-2 relative">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("game.form.title")}</span>
      </h3>
      <Field name="name" validate={[required(t("game.form.name.required"))]}>
        {(field, props) => (
          <Input
            title={t("game.form.name.label")}
            placeholder={t("game.form.name.placeholder")}
            icon={<span class="shrink-0 icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
            value={field.value}
            error={field.error}
            {...props}
          />
        )}
      </Field>
      <Field name="brief" validate={[required(t("game.form.brief.required"))]}>
        {(field, props) => (
          <Input
            title={t("game.form.brief.label")}
            placeholder={t("game.form.brief.placeholder")}
            icon={<span class="shrink-0 icon-[fluent--list-20-regular] w-5 h-5" />}
            value={field.value}
            error={field.error}
            {...props}
          />
        )}
      </Field>
      <Show when={!props.training}>
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
                            placeholder="yyyy-mm-dd hh:mm - yyyy-mm-dd hh:mm"
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
                            placeholder="yyyy-mm-dd hh:mm - yyyy-mm-dd hh:mm"
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
      </Show>
      <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-2">
        <Field name="hidden" type="boolean">
          {(field, props) => (
            <Checkbox
              inputProps={props}
              title={t("game.form.hidden.label")}
              checked={field.value ?? false}
              error={field.error}
            >
              <span class="flex-1 text-start truncate">{t("game.form.hidden.label")}</span>
            </Checkbox>
          )}
        </Field>
        <Show when={!props.training}>
          <Field name="frozen" type="boolean">
            {(field, props) => (
              <Checkbox
                inputProps={props}
                title={t("game.form.frozen.label")}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.form.frozen.label")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="offline" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.form.offline.label")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.form.offline.label")}</span>
              </Checkbox>
            )}
          </Field>
        </Show>
      </div>

      <Show when={!props.training}>
        <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-2">
          <Field
            name="team_size"
            type="number"
            validate={[
              required(t("game.form.teamSize.required")),
              minRange(1, t("game.form.teamSize.minimum")),
              maxRange(99, t("game.form.teamSize.maximum")),
            ]}
          >
            {(field, props) => (
              <Input
                {...props}
                value={field.value}
                error={field.error}
                class="flex-1"
                title={t("game.form.teamSize.label")}
                placeholder={t("game.form.teamSize.placeholder")}
                type="number"
              />
            )}
          </Field>
          <Field name="enable_audit" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.form.enableTeamAudit.label")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.form.enableTeamAudit.label")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="can_register_after_started" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.form.canRegisterAfterStart.label")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.form.canRegisterAfterStart.label")}</span>
              </Checkbox>
            )}
          </Field>
        </div>
        <Field name="award_rate" type="number">
          {(field, props) => (
            <Slider
              label={t("game.form.awardRate.label")}
              max={100}
              min={0}
              step={1}
              inputProps={props}
              name={field.name}
              value={[field.value || 0]}
              onValueChange={(value) => {
                const v = value.value[0] as number;
                setValues(form, {
                  award_rate: v,
                  first_blood_award: v,
                  second_blood_award: Math.floor((v * 2) / 3),
                  third_blood_award: Math.floor(v / 3),
                });
              }}
            />
          )}
        </Field>
        <div class="flex flex-row items-center space-x-2">
          <Field name="first_blood_award" type="number">
            {(field, props) => (
              <Slider
                label={t("game.form.awardRate.firstBlood")}
                max={100}
                min={0}
                step={1}
                inputProps={props}
                name={field.name}
                value={[field.value || 0]}
                class="flex-1"
                onValueChange={(value) => {
                  const v = value.value[0] as number;
                  setValues(form, {
                    first_blood_award: v,
                  });
                }}
              />
            )}
          </Field>
          <Field name="second_blood_award" type="number">
            {(field, props) => (
              <Slider
                label={t("game.form.awardRate.secondBlood")}
                max={100}
                min={0}
                step={1}
                inputProps={props}
                name={field.name}
                value={[field.value || 0]}
                class="flex-1"
                onValueChange={(value) => {
                  const v = value.value[0] as number;
                  setValues(form, {
                    second_blood_award: v,
                  });
                }}
              />
            )}
          </Field>
          <Field name="third_blood_award" type="number">
            {(field, props) => (
              <Slider
                label={t("game.form.awardRate.thirdBlood")}
                max={100}
                min={0}
                step={1}
                inputProps={props}
                name={field.name}
                value={[field.value || 0]}
                class="flex-1"
                onValueChange={(value) => {
                  const v = value.value[0] as number;
                  setValues(form, {
                    third_blood_award: v,
                  });
                }}
              />
            )}
          </Field>
        </div>
        <div class="flex flex-row items-center space-x-2">
          <Field name="enable_hammer" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.form.enableHammer.label")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
                class="flex-1"
              >
                <span class="flex-1 text-start truncate">{t("game.form.enableHammer.label")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="outer_hammer_label">
            {(field, props) => (
              <Input
                class="flex-1"
                title={t("game.form.outerHammerLabel.label")}
                placeholder={t("game.form.outerHammerLabel.placeholder")}
                icon={<span class="shrink-0 icon-[fluent--send-20-regular] w-5 h-5" />}
                value={field.value}
                error={field.error}
                {...props}
              />
            )}
          </Field>
        </div>
        <Field name="outer_hammer_url">
          {(field, props) => (
            <Input
              title={t("game.form.outerHammerUrl.label")}
              placeholder={t("game.form.outerHammerUrl.placeholder")}
              icon={<span class="shrink-0 icon-[fluent--link-20-regular] w-5 h-5" />}
              value={field.value}
              error={field.error}
              {...props}
            />
          )}
        </Field>
      </Show>
      <div class="mt-4! flex flex-row space-x-2">
        <Button type="submit" level="primary" class="flex-1" loading={game.isLoading} disabled={game.isLoading}>
          {t("general.actions.save.title")}
        </Button>
        <FormDraftReset
          when={draft.hasDraft()}
          loading={game.isLoading}
          disabled={game.isLoading}
          onConfirm={draft.discardDraft}
        />
      </div>
    </Form>
  );
}
