import { handleHttpError } from "@api";
import { createTeam } from "@api/game";
import { generateRandomName } from "@lib/utils/random-names";
import { createForm, maxLength, required, setValue } from "@modular-forms/solid";
import { useNavigate } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { canParticipate, gameParticipateState, gameStore, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t, themeStore } from "@storage/theme";
import { addToast } from "@storage/toast";
import Article from "@widgets/article";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Dialog from "@widgets/dialog";
import Input from "@widgets/input";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import clsx from "clsx";
import { Show, createEffect, createSignal, untrack } from "solid-js";

type TeamCreateForm = {
  name: string;
  tag: string;
  accepted: boolean;
};

export default function () {
  const navigate = useNavigate();
  const [customDisabled, setCustomDisabled] = createSignal(false);
  const [form, { Form, Field }] = createForm<TeamCreateForm>();
  createEffect(() => {
    if (gameStore.current && !canParticipate()) {
      addToast({
        level: "warning",
        description: t("game.canNotParticipate")!,
        duration: 5000,
      });
      navigate(`/games/${gameStore.current.id}`, { replace: true });
    }
  });
  createEffect(() => {
    if (gameStore.current) {
      untrack(() => {
        setCustomDisabled(gameStore.current?.team_size === 1);
        if (gameStore.current?.team_size === 1) setValue(form, "name", accountStore.nickname!);
      });
    }
  });
  const [loading, setLoading] = createSignal(false);
  async function onSubmit(data: TeamCreateForm) {
    setLoading(true);
    try {
      const team = await createTeam(gameStore.current!.id, data);
      setGameStore({ team, showTeamCover: true });
      setTimeout(() => {
        navigate(`/games/${gameStore.current?.id}`);
      }, 2000);
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.create.status.fail")!);
    }
    setLoading(false);
  }
  const [generator, setGenerator] = createSignal<"chuunibyou" | "hacker">("hacker");
  const [content, setContent] = createSignal(null as null | string);
  const comps = import.meta.glob("../../_blocks/contents/*.md");
  createEffect(() => {
    if (themeStore.locale) {
      untrack(async () => {
        const match = comps[`../../_blocks/contents/welcome.${themeStore.locale}.md`];
        setContent(((await match()) as { default: string }).default);
      });
    }
  });
  const [dialogOpen, setDialogOpen] = createSignal(false);
  return (
    <>
      <Title page={t("team.create.title")} route={`/games/${gameStore.current?.id}/teams/create`} />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={onSubmit} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("team.create.title")}</h2>
            <Field
              name="name"
              validate={[required(t("team.form.name.required")!), maxLength(32, t("team.form.name.maximumLength")!)]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                  title={customDisabled() ? t("team.form.name.customDisabled") : t("team.form.name.label")}
                  placeholder={t("team.form.name.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                  disabled={customDisabled()}
                  extraBtn={
                    <>
                      <Button
                        class="!rounded-none"
                        square
                        type="button"
                        disabled={customDisabled()}
                        onClick={async () => {
                          const name = await generateRandomName(generator());
                          setValue(form, "name", name);
                        }}
                      >
                        <span class="icon-[fluent--diversity-20-regular] w-5 h-5" />
                      </Button>
                      <Popover
                        class="!rounded-l-none"
                        square
                        type="button"
                        disabled={customDisabled()}
                        btnContent={<span class="icon-[fluent--settings-20-regular] w-5 h-5" />}
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
            <Field name="tag" validate={[maxLength(32, t("team.form.tag.maximumLength")!)]}>
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--tag-20-regular] w-5 h-5" />}
                  title={t("team.form.tag.label")}
                  placeholder={t("team.form.tag.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                />
              )}
            </Field>
            <Field name="accepted" type="boolean" validate={[required(t("team.form.acceptRules.required")!)]}>
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
                          fallback={<span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5" />}
                        >
                          <span class="icon-[fluent--checkmark-circle-20-filled] w-5 h-5 text-primary" />
                        </Show>
                        <span>{t("team.form.acceptRules.label")}</span>
                      </>
                    }
                  >
                    <div class="w-full">
                      <h2 class="text-center text-3xl font-bold p-4 pb-0">{t("team.form.acceptRules.title")}</h2>
                      <Article class="self-center" content={content() || ""} noExtraPaddings />
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
                loading={loading()}
                disabled={loading() || !gameParticipateState()[0]}
              >
                {gameParticipateState()[0] ? t("general.actions.create.title") : gameParticipateState()[1]}
              </Button>
              <Show when={(gameStore.current?.team_size || 0) > 1}>
                <Link href={`/games/${gameStore.current?.id}/teams/join`}>
                  <span>{t("team.join.title")}</span>
                  <span class="icon-[fluent--arrow-right-20-regular] w-5 h-5" />
                </Link>
              </Show>
            </div>
          </Form>
        </Card>
      </div>
    </>
  );
}
