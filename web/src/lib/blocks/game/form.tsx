import type { Game } from "@models/game";
import { createForm, maxRange, minRange, required, setValues } from "@modular-forms/solid";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Input from "@widgets/input";
import Slider from "@widgets/slider";
import TimePicker from "@widgets/timepicker";
import { DateTime } from "luxon";
import { Show, createEffect, untrack } from "solid-js";

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
  award_rate_1?: number;
  award_rate_2?: number;
  award_rate_3?: number;
};

export default function GameEdit(props: {
  onDone: (result: GameForm) => void;
  editSource?: Game;
  loading?: boolean;
  inGame?: boolean;
}) {
  const [form, { Form, Field }] = createForm<GameForm>();
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValues(form, {
          ...props.editSource,
          start_at: props.editSource!.start_at.toSeconds(),
          end_at: props.editSource!.end_at.toSeconds(),
          register_at: props.editSource!.register_at.toSeconds(),
          archive_at: props.editSource!.archive_at.toSeconds(),
          award_rate_1: props.editSource!.award_rates?.[0] || props.editSource!.award_rate,
          award_rate_2: Math.floor(props.editSource!.award_rates?.[1] || (props.editSource!.award_rate * 2) / 3),
          award_rate_3: Math.floor(props.editSource!.award_rates?.[2] || props.editSource!.award_rate / 3),
        });
      });
    }
  });
  return (
    <Form onSubmit={props.onDone} class="flex flex-col w-full max-w-5xl space-y-2 relative">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("game.admin.edit.title")}</span>
      </h3>
      <Field name="name" validate={[required(t("game.nameRequired")!)]}>
        {(field, props) => (
          <Input
            title={t("game.admin.namePlaceholder")}
            placeholder={t("game.admin.namePlaceholder")}
            icon={<span class="icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
            value={field.value}
            error={field.error}
            {...props}
          />
        )}
      </Field>
      <Field name="brief" validate={[required(t("game.briefRequired")!)]}>
        {(field, props) => (
          <Input
            title={t("game.admin.briefPlaceholder")}
            placeholder={t("game.admin.briefPlaceholder")}
            icon={<span class="icon-[fluent--list-20-regular] w-5 h-5" />}
            value={field.value}
            error={field.error}
            {...props}
          />
        )}
      </Field>
      <Show when={props.inGame}>
        <Field name="start_at" type="number" validate={[required(t("game.startAtRequired")!)]}>
          {(startAtField) => (
            <Field name="end_at" type="number" validate={[required(t("game.endAtRequired")!)]}>
              {(endAtField) => (
                <Field name="register_at" type="number" validate={[required(t("game.registerAtRequired")!)]}>
                  {(registerAtField) => (
                    <Field name="archive_at" type="number" validate={[required(t("game.archiveAtRequired")!)]}>
                      {(archiveAtField) => (
                        <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                          <TimePicker
                            class="flex-1"
                            form={form}
                            type="time"
                            range
                            title={t("game.startEndTime")}
                            placeholder={t("game.startEndTime")}
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
                            title={t("game.registerArchiveTime")}
                            placeholder={t("game.registerArchiveTime")}
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
              title={t("game.admin.hidden")}
              checked={field.value ?? false}
              error={field.error}
            >
              <span class="flex-1 text-start truncate">{t("game.admin.hidden")}</span>
            </Checkbox>
          )}
        </Field>
        <Show when={props.inGame}>
          <Field name="frozen" type="boolean">
            {(field, props) => (
              <Checkbox
                inputProps={props}
                title={t("game.admin.frozen")}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.admin.frozen")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="offline" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.admin.offline")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.admin.offline")}</span>
              </Checkbox>
            )}
          </Field>
        </Show>
      </div>

      <Show when={props.inGame}>
        <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-2">
          <Field
            name="team_size"
            type="number"
            validate={[
              required(t("game.team.sizeRequired")!),
              minRange(1, t("game.team.sizeMinExceeded")!),
              maxRange(99, t("game.team.sizeMaxExceeded")!),
            ]}
          >
            {(field, props) => (
              <Input
                {...props}
                value={field.value}
                error={field.error}
                class="flex-1"
                title={t("game.admin.teamSizePlaceholder")}
                placeholder={t("game.admin.teamSizePlaceholder")!}
                type="number"
              />
            )}
          </Field>
          <Field name="enable_audit" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.admin.enableAudit")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.admin.enableAudit")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="can_register_after_started" type="boolean">
            {(field, props) => (
              <Checkbox
                title={t("game.admin.canRegisterAfterStarted")}
                inputProps={props}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start truncate">{t("game.admin.canRegisterAfterStarted")}</span>
              </Checkbox>
            )}
          </Field>
        </div>
        <Field name="award_rate" type="number">
          {(field, props) => (
            <Slider
              label={t("game.admin.awardRate")}
              max={100}
              min={0}
              step={1}
              inputProps={props}
              name={field.name}
              value={[field.value || 0]}
              onValueChange={(value: { value: [number] }) => {
                const v = value.value[0] as number;
                setValues(form, {
                  award_rate: v,
                  award_rate_1: v,
                  award_rate_2: Math.floor((v * 2) / 3),
                  award_rate_3: Math.floor(v / 3),
                });
              }}
            />
          )}
        </Field>
        <div class="flex flex-row items-center space-x-2">
          <Field name="award_rate_1" type="number">
            {(field, props) => (
              <Slider
                label={t("game.admin.awardRate1")}
                max={100}
                min={0}
                step={1}
                inputProps={props}
                name={field.name}
                value={[field.value || 0]}
                class="flex-1"
                onValueChange={(value: { value: [number] }) => {
                  const v = value.value[0] as number;
                  setValues(form, {
                    award_rate_1: v,
                  });
                }}
              />
            )}
          </Field>
          <Field name="award_rate_2" type="number">
            {(field, props) => (
              <Slider
                label={t("game.admin.awardRate2")}
                max={100}
                min={0}
                step={1}
                inputProps={props}
                name={field.name}
                value={[field.value || 0]}
                class="flex-1"
                onValueChange={(value: { value: [number] }) => {
                  const v = value.value[0] as number;
                  setValues(form, {
                    award_rate_2: v,
                  });
                }}
              />
            )}
          </Field>
          <Field name="award_rate_3" type="number">
            {(field, props) => (
              <Slider
                label={t("game.admin.awardRate3")}
                max={100}
                min={0}
                step={1}
                inputProps={props}
                name={field.name}
                value={[field.value || 0]}
                class="flex-1"
                onValueChange={(value: { value: [number] }) => {
                  const v = value.value[0] as number;
                  setValues(form, {
                    award_rate_3: v,
                  });
                }}
              />
            )}
          </Field>
        </div>
      </Show>
      <Button type="submit" level="primary" class="!mt-4" loading={props.loading} disabled={props.loading}>
        {t("form.save")}
      </Button>
    </Form>
  );
}
