import { useGame, useGameDoc } from "@api/game";
import { useCreateTeamMutation } from "@api/team";
import { generateRandomName } from "@lib/utils/random-names";
import { createForm, maxLength, required, setValue } from "@modular-forms/solid";
import { setTeamCoverStore } from "@routes/games/[game]/_blocks/team-cover";
import { useNavigate, useParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameParticipateState, isGameCanParticipate } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Article from "@widgets/article";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Dialog from "@widgets/dialog";
import Input from "@widgets/input";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import clsx from "clsx";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";

type TeamCreateForm = {
  name: string;
  tag: string;
  accepted: boolean;
};

export default function () {
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "0", 10) || 0;

  const navigate = useNavigate();
  if (!accountStore.token) {
    navigate(`/account/login?next=/games/${gameId()}/teams/create`, { replace: true });
  }

  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  const blockReason = createMemo(() => {
    if (!game.data) return null;

    const [canRegister, message] = gameParticipateState(game.data);
    if (!canRegister) return message || t("game.registerEnded");

    if (!isGameCanParticipate(game.data)) return t("game.canNotParticipate");

    return null;
  });

  createEffect(() => {
    if (!game.data) return;
    const reason = blockReason();
    if (!reason) return;
    addToast({
      level: "warning",
      description: reason,
      duration: 5000,
    });
    navigate(`/games/${gameId()}`, { replace: true });
  });

  const [form, { Form, Field }] = createForm<TeamCreateForm>();
  createEffect(() => {
    if (game.data?.team_size === 1) {
      untrack(() => {
        setValue(form, "name", accountStore.nickname!);
      });
    }
  });

  const createTeamMutation = useCreateTeamMutation({
    onSuccess: () => {
      setTeamCoverStore({ showTeamCover: true });
      setTimeout(() => {
        navigate(`/games/${gameId()}`);
      }, 2000);
    },
  });

  const submitLabel = createMemo(() => blockReason() ?? t("general.actions.create.title"));
  const submitDisabled = createMemo(() => createTeamMutation.isPending || !game.data || !!blockReason());

  function onSubmit(data: TeamCreateForm) {
    if (!game.data) return;
    createTeamMutation.mutate({
      game_id: gameId(),
      team: {
        name: data.name,
        tag: data.tag || null,
      },
    });
  }
  const [generator, setGenerator] = createSignal<"chuunibyou" | "hacker">("hacker");
  const rules = useGameDoc({
    id: gameId,
    type: () => "rules",
    enabled: () => gameId() > 0,
  });
  const [dialogOpen, setDialogOpen] = createSignal(false);
  return (
    <>
      <Title page={t("team.create.title")} route={`/games/${gameId()}/teams/create`} />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={onSubmit} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("team.create.title")}</h2>
            <Field
              name="name"
              validate={[required(t("team.form.name.required")!), maxLength(32, t("team.form.name.maximumLength"))]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                  title={t("team.form.name.label")}
                  placeholder={t("team.form.name.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                  extraBtn={
                    <>
                      <Button
                        class="rounded-none!"
                        square
                        type="button"
                        onClick={async () => {
                          const name = await generateRandomName(generator());
                          setValue(form, "name", name);
                        }}
                      >
                        <span class="shrink-0 icon-[fluent--diversity-20-regular] w-5 h-5" />
                      </Button>
                      <Popover
                        class="rounded-l-none!"
                        square
                        type="button"
                        btnContent={<span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />}
                      >
                        <Card contentClass="p-2 flex flex-col space-y-2">
                          <Button ghost size="sm" justify="start" type="button" onClick={() => setGenerator("hacker")}>
                            <span
                              class={clsx(
                                "icon-[fluent--diversity-20-regular] w-5 h-5",
                                generator() === "hacker" && "text-primary"
                              )}
                            />
                            <span>Hacker Names</span>
                          </Button>
                          <Button
                            ghost
                            size="sm"
                            justify="start"
                            type="button"
                            onClick={() => setGenerator("chuunibyou")}
                          >
                            <span
                              class={clsx(
                                "icon-[fluent--diversity-20-regular] w-5 h-5",
                                generator() === "chuunibyou" && "text-primary"
                              )}
                            />
                            <span>{t("team.form.name.chuunibyouGenerator")}</span>
                          </Button>
                        </Card>
                      </Popover>
                    </>
                  }
                />
              )}
            </Field>
            <Field name="tag" validate={[maxLength(32, t("team.form.tag.maximumLength"))]}>
              {(field, props) => (
                <Input
                  icon={<span class="shrink-0 icon-[fluent--tag-20-regular] w-5 h-5" />}
                  title={t("team.form.tag.label")}
                  placeholder={t("team.form.tag.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                />
              )}
            </Field>
            <Field name="accepted" type="boolean" validate={[required(t("team.form.acceptRules.required"))]}>
              {(field, props) => (
                <>
                  <input type="checkbox" class="hidden" {...props} checked={field.value} />
                  <Dialog
                    justify="start"
                    ghost
                    open={dialogOpen()}
                    stretched
                    onOpenChange={(details) => setDialogOpen(details.open)}
                    // onClick={() => setDialogOpen(true)}
                    level={field.error ? "error" : null}
                    btnContent={
                      <>
                        <Show
                          when={field.value}
                          fallback={<span class="shrink-0 icon-[fluent--checkmark-circle-20-regular] w-5 h-5" />}
                        >
                          <span class="shrink-0 icon-[fluent--checkmark-circle-20-filled] w-5 h-5 text-primary" />
                        </Show>
                        <span>{t("team.form.acceptRules.label")}</span>
                      </>
                    }
                  >
                    <div class="w-full">
                      <h2 class="text-center text-3xl font-bold p-4 pb-0">{t("team.form.acceptRules.title")}</h2>
                      <Article class="self-center" content={rules.data || ""} noExtraPaddings />
                    </div>
                    <div class="flex space-x-2">
                      <Button
                        class="flex-1"
                        level="success"
                        onClick={() => {
                          setValue(form, "accepted", true);
                          setDialogOpen(false);
                        }}
                        disabled={field.value}
                      >
                        <span>
                          <Show when={field.value}>{t("team.form.acceptRules.ok")}</Show>
                          <Show when={!field.value}>{t("general.actions.yes.title")}</Show>
                        </span>
                      </Button>
                      <Show when={field.value}>
                        <Button level="error" onClick={() => setValue(form, "accepted", false)}>
                          <span>{t("general.actions.no.title")}</span>
                        </Button>
                      </Show>
                    </div>
                  </Dialog>
                </>
              )}
            </Field>
            <div class="flex flex-row space-x-2">
              <Button
                type="submit"
                level="primary"
                class="flex-1"
                loading={createTeamMutation.isPending}
                disabled={submitDisabled()}
              >
                {submitLabel()}
              </Button>
              <Show when={(game.data?.team_size || 0) > 1}>
                <Link href={`/games/${gameId()}/teams/join`}>
                  <span>{t("team.join.title")}</span>
                  <span class="shrink-0 icon-[fluent--arrow-right-20-regular] w-5 h-5" />
                </Link>
              </Show>
            </div>
          </Form>
        </Card>
      </div>
    </>
  );
}
