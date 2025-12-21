import { inflyClient } from "@api";
import {
  useChallenge,
  useChallengeHints,
  useCreateChallengeHintMutation,
  useDeleteChallengeHintMutation,
  useUnlockChallengeHintMutation,
} from "@api/challenge";
import { useGame } from "@api/game";
import { useSelfTeam, useTeamExtras } from "@api/team";
import { clearError, createForm, required, reset as resetForm } from "@modular-forms/solid";
import { isAdminOfGame } from "@storage/game";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import clsx from "clsx";
import { LoremIpsum } from "lorem-ipsum";
import { DateTime } from "luxon";
import { createSignal, For, Show } from "solid-js";
import type { ChallengeWidgetProps } from ".";

type CreateHintForm = {
  content: string;
  cost: number;
};

export default function (props: ChallengeWidgetProps) {
  // const [hints, setHints] = createSignal([] as Hint[]);
  // const [extras, setExtras] = createSignal([] as Extra[]);
  // const [unlocking, setUnlocking] = createSignal(false);
  const game = useGame({ id: () => props.gameId });
  const challenge = useChallenge({ game_id: () => props.gameId, challenge_id: () => props.challengeId });
  const team = useSelfTeam({
    game_id: () => props.gameId,
    enabled: () => !props.training && !!game.data && !isAdminOfGame(game.data),
  });

  const hints = useChallengeHints({ game_id: () => props.gameId, challenge_id: () => props.challengeId });
  const extras = useTeamExtras({
    game_id: () => props.gameId,
    team_id: () => team.data?.id || 0,
    enabled: () => !props.training && !!game.data && !isAdminOfGame(game.data),
  });

  const createMutation = useCreateChallengeHintMutation({
    onSuccess: () => {
      resetForm(form, {
        initialValues: {
          content: "",
          cost: 0,
        },
      });
      setPtsInputIconIndex(0);
      hints.refetch();
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId, "commitHistory"],
      });
    },
  });
  const deleteMutation = useDeleteChallengeHintMutation({
    onSuccess: () => {
      hints.refetch();

      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId, "commitHistory"],
      });
    },
  });
  const unlockMutation = useUnlockChallengeHintMutation({
    onSuccess: () => {
      hints.refetch();
      team.refetch();
      extras.refetch();
    },
  });

  const ptsInputIcon = ["icon-[fluent--subtract-20-regular]", "icon-[fluent--add-20-regular]"];
  const [ptsInputIconIndex, setPtsInputIconIndex] = createSignal(0);

  const lorem = new LoremIpsum({
    wordsPerSentence: {
      max: 8,
      min: 3,
    },
  });

  const [form, { Form, Field }] = createForm<CreateHintForm>({
    initialValues: {
      cost: 0,
    },
  });

  const plus_or_minus = (n: number) => `${n < 0 ? "- " : n > 0 ? "+ " : ""}${Math.abs(n)}`;
  const hint_color = (cost: number, is_admin = false) => {
    if (is_admin) return cost >= 0 ? "text-info" : "text-warning";
    return cost > 0 ? "text-warning" : "text-success";
  };
  return (
    <div class="flex flex-col p-3 lg:p-6">
      <For
        each={hints.data ?? []}
        fallback={
          <div class="px-2 min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2">
            <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5 text-primary" />
            <span class="font-bold opacity-60">{t("challenge.hint.empty")}</span>
          </div>
        }
      >
        {(hint) => (
          <div class="px-2 min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2">
            <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5 text-primary" />
            <Show
              when={
                props.training ||
                isAdminOfGame(game.data) ||
                hint.cost === 0 ||
                extras.data?.find((e) => e.hint_id === hint.id) ||
                (challenge.data?.archive_at &&
                  challenge.data.archive_at < DateTime.now() &&
                  game.data?.archive_policy.challenge.show_hints) ||
                (game.data?.end_at && game.data.end_at < DateTime.now())
              }
              fallback={
                <>
                  <span class="blur pointer-events-none select-none flex-1">{lorem.generateSentences(1)}</span>
                  <Popover
                    size="sm"
                    ghost
                    btnContent={
                      <>
                        <span class={hint_color(hint.cost)}>{plus_or_minus(-hint.cost)}</span>
                        <span class={clsx("opacity-60", hint_color(hint.cost))}>pts</span>
                        <span class={clsx("icon-[fluent--lock-20-regular] w-5 h-5", hint_color(hint.cost))} />
                      </>
                    }
                  >
                    <Card contentClass="p-2 flex flex-row items-center">
                      <span class="px-2">
                        {t("challenge.hint.unlockConfirm", {
                          cost: hint.cost,
                        })}
                      </span>
                      <Button
                        size="sm"
                        level="error"
                        onClick={() =>
                          unlockMutation.mutate({
                            game_id: props.gameId,
                            challenge_id: props.challengeId,
                            hint_id: hint.id,
                          })
                        }
                        disabled={unlockMutation.isPending}
                        loading={unlockMutation.isPending}
                      >
                        {t("general.actions.yes.title")}
                      </Button>
                    </Card>
                  </Popover>
                </>
              }
            >
              <span class="flex-1 text-start">{hint.content}</span>
              <Show when={hint.cost !== 0}>
                <div class="btn btn-sm btn-ghost justify-center hover:bg-transparent cursor-auto">
                  <span
                    class={clsx(
                      isAdminOfGame(game.data) ? "" : "opacity-60",
                      hint_color(hint.cost, isAdminOfGame(game.data))
                    )}
                  >
                    {plus_or_minus(-hint.cost)}
                  </span>
                  <span
                    class={clsx(
                      isAdminOfGame(game.data) ? "" : "opacity-60",
                      hint_color(hint.cost, isAdminOfGame(game.data))
                    )}
                  >
                    pts
                  </span>
                  <span
                    class={clsx(
                      "icon-[fluent--lock-open-20-regular] w-5 h-5",
                      isAdminOfGame(game.data) ? "" : "opacity-60",
                      hint_color(hint.cost, isAdminOfGame(game.data))
                    )}
                  />
                </div>
              </Show>
            </Show>
            <Show when={isAdminOfGame(game.data)}>
              <Button
                size="sm"
                ghost
                square
                onClick={() => {
                  deleteMutation.mutate({
                    game_id: props.gameId,
                    challenge_id: props.challengeId,
                    hint_id: hint.id,
                  });
                }}
              >
                <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />
              </Button>
            </Show>
          </div>
        )}
      </For>
      <Show when={isAdminOfGame(game.data)}>
        <Form
          onSubmit={(value) => {
            createMutation.mutate({
              game_id: props.gameId,
              challenge_id: props.challengeId,
              hint: {
                ...value,
                id: 0,
                created_at: DateTime.now(),
                challenge_id: props.challengeId,
              },
            });
          }}
          class="px-2 min-h-12 border-b border-b-layer-content/10 flex items-center space-x-2"
        >
          <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5 text-primary" />
          <Field name="content" validate={[required(t("challenge.hint.form.content.required"))]}>
            {(field, props) => (
              <Input
                type="text"
                value={field.value}
                error={field.error}
                {...props}
                required
                noLabel
                placeholder={t("challenge.hint.form.content.placeholder")}
                class="flex-1"
                size="sm"
                onBlur={(e) => {
                  clearError(form, "content");
                  return props.onBlur(e);
                }}
              />
            )}
          </Field>
          <Field name="cost" type="number">
            {(field, props) => (
              <Input
                type="text" // use text, we will convert to number manually
                value={field.value}
                error={field.error}
                {...props}
                onInput={(e) => {
                  // set num to `null` for prevValue
                  const setNumber = (num: number | null, str: string, _switch: boolean) => {
                    if (_switch) {
                      setPtsInputIconIndex(ptsInputIconIndex() === 0 ? 1 : 0);
                    }
                    e.currentTarget.value = str;
                    Object.defineProperty(e.currentTarget, "valueAsNumber", {
                      writable: true,
                    });
                    e.currentTarget.valueAsNumber = num || 0;
                    Object.freeze(e.currentTarget.valueAsNumber);
                  };
                  // manually parse number
                  function parseNumber(_v: string): [number | null, string, boolean] {
                    let value = _v;
                    if (value === "0-") return [0, "0", true];
                    const neg = (/^(-*)/.exec(value)?.[1].length ?? 0) % 2 === 1;
                    value = value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
                    const n = Number.parseInt(value, 10);
                    return [!Number.isNaN(n) ? n : 0, value, neg];
                  }
                  setNumber(...parseNumber(e.currentTarget.value));
                  return props.onInput(e);
                }}
                noLabel
                placeholder={t("challenge.hint.form.cost.placeholder")}
                class="w-32"
                size="sm"
                icon={<span class={ptsInputIcon[ptsInputIconIndex()]} />}
              />
            )}
          </Field>
          <span class="font-bold opacity-60">pts</span>
          <span class="w-2" />
          <Button
            size="sm"
            level="primary"
            type="submit"
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
          >
            <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
            <span>{t("general.actions.add.title")}</span>
          </Button>
        </Form>
      </Show>
    </div>
  );
}
