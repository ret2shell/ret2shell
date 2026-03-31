import { useCreateGameMutation } from "@api/game";
import { type Game, HostType } from "@models/game";
import { createForm, required } from "@modular-forms/solid";
import { accountStore } from "@storage/account";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Input from "@widgets/input";
import { DateTime } from "luxon";
import { createMemo } from "solid-js";

type CreatePlaygroundForm = {
  name: string;
  brief: string;
};

export default function CreatePlayground(props: { onDone: (game: Game) => void }) {
  const [_, { Form, Field }] = createForm<CreatePlaygroundForm>();
  const createGameMutation = useCreateGameMutation({
    onSuccess: (game) => props.onDone(game),
  });

  const loading = createMemo(() => createGameMutation.isPending);
  function onSubmit(result: CreatePlaygroundForm) {
    const req: Game = {
      ...result,
      start_at: DateTime.fromFormat("2002-05-05", "yyyy-MM-dd"),
      end_at: DateTime.fromFormat("2077-01-01", "yyyy-MM-dd"),
      register_at: DateTime.fromFormat("2002-05-05", "yyyy-MM-dd"),
      archive_at: DateTime.fromFormat("2077-01-01", "yyyy-MM-dd"),
      host_type: HostType.Training,
      id: 0,
      hidden: true,
      frozen: false,
      updated_at: DateTime.now(),
      introduction_id: null,
      access_policy: { restrict: false, institutes: [], sync: 2 },
      cover: null,
      logo: null,
      admins: [accountStore.id!],
      token: null,
      sync_key: null,
      sync_token: null,
      offline: false,
      team_size: 1,
      can_register_after_started: true,
      enable_audit: false,
      weight: 1,
      hammer_policy: {
        enabled: false,
        outer_label: null,
        outer_url: null,
      },
      archive_policy: { challenge: { show_answer: false, show_hints: false } },
      timeline_presets: [],
      award_rate: 0,
      award_rates: [0, 0, 0],
      node_selector: null,
      traffic: null,
      lifecycle: null,
      bucket: null,
    };
    createGameMutation.mutate(req);
  }
  return (
    <div class="flex-1 self-center w-full max-w-5xl flex flex-col">
      <h1 class="text-3xl text-center font-bold mt-8">
        {t("general.actions.create.title")} - {t("training.title")}
      </h1>
      <Form onSubmit={onSubmit} class="flex flex-col space-y-2 py-3 lg:py-6">
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
        <Button type="submit" level="primary" class="mt-4!" loading={loading()} disabled={loading()}>
          {t("general.actions.create.title")}
        </Button>
      </Form>
    </div>
  );
}
