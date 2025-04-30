import { handleHttpError } from "@api";
import {
  createChallengeHint,
  deleteChallengeHint,
  getChallengeHint,
  getTeamExtras,
  unlockChallengeHint,
} from "@api/game";
import type { Challenge } from "@models/challenge";
import type { Extra } from "@models/extra";
import type { Hint } from "@models/hint";
import { clearError, createForm, required, reset as resetForm, setValue } from "@modular-forms/solid";
import { challengeStore } from "@storage/challenge";
import { gameStore, isGameAdmin } from "@storage/game";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import clsx from "clsx";
import { LoremIpsum } from "lorem-ipsum";
import { DateTime } from "luxon";
import { For, Show, createEffect, createSignal, untrack } from "solid-js";

type CreateHintForm = {
  content: string;
  cost: number;
};

export default function (_props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [hints, setHints] = createSignal([] as Hint[]);
  const [extras, setExtras] = createSignal([] as Extra[]);
  const [unlocking, setUnlocking] = createSignal(false);
  const ptsInputIcon = ["icon-[fluent--subtract-20-regular]", "icon-[fluent--add-20-regular]"];
  const [ptsInputIconIndex, setPtsInputIconIndex] = createSignal(0);
  const lorem = new LoremIpsum({
    wordsPerSentence: {
      max: 8,
      min: 3,
    },
  });
  const [form, { Form, Field }] = createForm<CreateHintForm>();
  setValue(form, "cost", 0);
  const [loading, setLoading] = createSignal(false);
  async function onSubmit(result: CreateHintForm) {
    const hint = {
      id: 0,
      created_at: DateTime.now(),
      challenge_id: challengeStore.current!.id,
      content: result.content,
      cost: (result.cost || 0) * (ptsInputIconIndex() === 0 ? 1 : -1),
    } as Hint;
    try {
      await createChallengeHint(challengeStore.current!.game_id, challengeStore.current!.id, hint);
      addToast({
        level: "success",
        description: t("general.actions.create.status.success")!,
        duration: 5000,
      });
      resetForm(form, {
        initialValues: {
          content: "",
          cost: 0,
        },
      });
      refreshHint();
      setPtsInputIconIndex(0);
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.create.status.fail")!);
    }
  }
  async function refreshHint() {
    setLoading(true);
    try {
      async function getExtrasOpt() {
        if (!isGameAdmin() && gameStore.team) {
          return await getTeamExtras(gameStore.current!.id, gameStore.team.id);
        }
        return [];
      }
      const [hints, extras] = await Promise.all([
        getChallengeHint(gameStore.current!.id, challengeStore.current!.id),
        getExtrasOpt(),
      ]);
      setHints(hints);
      if (extras.length) {
        setExtras(extras);
      }
    } catch (err) {
      handleHttpError(err as Error, t("challenge.hint.errors.fetch.title")!);
    }
    setLoading(false);
  }
  createEffect(() => {
    if (challengeStore.current) {
      untrack(() => {
        refreshHint();
      });
    }
    if (gameStore.current && gameStore.team) {
      untrack(() => {
        refreshHint();
      });
    }
  });

  async function handleDeleteHint(id: number) {
    try {
      await deleteChallengeHint(gameStore.current!.id, challengeStore.current!.id, id);
      refreshHint();
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.delete.status.fail")!);
    }
  }

  async function handleUnlockHint(id: number) {
    setUnlocking(true);
    try {
      await unlockChallengeHint(gameStore.current!.id, challengeStore.current!.id, id);
      refreshHint();
    } catch (err) {
      handleHttpError(err as Error, t("challenge.hint.errors.unlock.title")!);
    }
    setUnlocking(false);
  }

  const plus_or_minus = (n: number) => `${n < 0 ? "- " : n > 0 ? "+ " : ""}${Math.abs(n)}`;
  const hint_color = (cost: number, is_admin = false) => {
    if (is_admin) return cost >= 0 ? "text-info" : "text-warning";
    return cost > 0 ? "text-warning" : "text-success";
  };
  return (
    <div class="flex flex-col p-3 lg:p-6">
      <For
        each={hints()}
        fallback={
          <div class="px-2 min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2">
            <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary shrink-0" />
            <span class="font-bold opacity-60">{t("challenge.hint.empty")}</span>
          </div>
        }
      >
        {(hint) => (
          <div class="px-2 min-h-12 py-1 border-b border-b-layer-content/10 flex items-center space-x-2">
            <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary shrink-0" />
            <Show
              when={
                !_props.inGame ||
                isGameAdmin() ||
                hint.cost === 0 ||
                extras().find((e) => e.hint_id === hint.id) ||
                (challengeStore.current?.archive_at &&
                  challengeStore.current.archive_at < DateTime.now() &&
                  gameStore.current?.archive_policy.challenge.show_hints) ||
                (gameStore.current?.end_at && gameStore.current.end_at < DateTime.now())
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
                        onClick={() => handleUnlockHint(hint.id)}
                        disabled={unlocking()}
                        loading={unlocking()}
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
                  <span class={clsx(isGameAdmin() ? "" : "opacity-60", hint_color(hint.cost, isGameAdmin()))}>
                    {plus_or_minus(-hint.cost)}
                  </span>
                  <span class={clsx(isGameAdmin() ? "" : "opacity-60", hint_color(hint.cost, isGameAdmin()))}>pts</span>
                  <span
                    class={clsx(
                      "icon-[fluent--lock-open-20-regular] w-5 h-5",
                      isGameAdmin() ? "" : "opacity-60",
                      hint_color(hint.cost, isGameAdmin())
                    )}
                  />
                </div>
              </Show>
            </Show>
            <Show when={isGameAdmin()}>
              <Button
                size="sm"
                ghost
                square
                onClick={() => {
                  handleDeleteHint(hint.id);
                }}
              >
                <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
              </Button>
            </Show>
          </div>
        )}
      </For>
      <Show when={isGameAdmin()}>
        <Form onSubmit={onSubmit} class="px-2 min-h-12 border-b border-b-layer-content/10 flex items-center space-x-2">
          <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary shrink-0" />
          <Field name="content" validate={[required(t("challenge.hint.form.content.required")!)]}>
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
                    const n = Number.parseInt(value);
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
          <Button size="sm" level="primary" type="submit" loading={loading()} disabled={loading()}>
            <span class="icon-[fluent--add-20-regular] w-5 h-5" />
            <span>{t("general.actions.add.title")}</span>
          </Button>
        </Form>
      </Show>
    </div>
  );
}
