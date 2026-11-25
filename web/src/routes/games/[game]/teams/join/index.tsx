import { useGame, useGameDoc } from "@api/game";
import { useJoinTeamMutation } from "@api/team";
import { createForm, required, setValue } from "@modular-forms/solid";
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
import { createMemo, createSignal, createTrackedEffect, Show } from "solid-js";

type TeamJoinForm = {
  token: string;
  accepted: boolean;
};

export default function () {
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "0", 10) || 0;

  const navigate = useNavigate();
  if (!accountStore.token) {
    navigate(`/account/login?next=/games/${gameId()}/teams/join`, {
      replace: true,
    });
  }

  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });
  const blockReason = createMemo(() => {
    if (!game.data) return null;

    const [canRegister, message] = gameParticipateState(game.data);
    if (!canRegister) return message || t("game.registerEnded");

    if (!isGameCanParticipate(game.data)) return t("game.canNotParticipate");

    return null;
  });

  const [form, { Form, Field }] = createForm<TeamJoinForm>();
  createTrackedEffect(() => {
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

  const joinTeamMutation = useJoinTeamMutation({
    onSuccess: () => {
      setTeamCoverStore((s) => {
        s.showTeamCover = true;
      });
      setTimeout(() => {
        navigate(`/games/${gameId()}`);
      }, 2000);
    },
  });

  const submitLabel = createMemo(() => blockReason() ?? t("team.join.title"));
  const submitDisabled = createMemo(() => joinTeamMutation.isPending || !game.data || !!blockReason());

  function onSubmit(data: TeamJoinForm) {
    if (!game.data) return;
    joinTeamMutation.mutate({
      game_id: gameId(),
      token: data.token,
    });
  }
  const rules = useGameDoc({
    id: gameId,
    type: () => "rules",
    enabled: () => gameId() > 0,
  });
  const [dialogOpen, setDialogOpen] = createSignal(false);
  return (
    <>
      <Title page={t("team.join.title")} route={`/games/${gameId()}/teams/join`} />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={onSubmit} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("team.join.title")}</h2>
            <Field name="token" validate={[required(t("team.join.form.token.required"))]}>
              {(field, props) => (
                <Input
                  icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                  title={t("team.join.form.token.label")}
                  placeholder={t("team.join.form.token.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
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
                          <Show when={!field.value}>{t("general.actions.accept.title")}</Show>
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
                loading={joinTeamMutation.isPending}
                disabled={submitDisabled()}
              >
                {submitLabel()}
              </Button>
              <Show when={(game.data?.team_size || 0) > 1}>
                <Link href={`/games/${gameId()}/teams/create`}>
                  <span>{t("team.create.title")}</span>
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
