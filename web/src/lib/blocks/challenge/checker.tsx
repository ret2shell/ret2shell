import { inflyClient } from "@api";
import { useChallengeCheckerScript, useUpdateChallengeCheckerScriptMutation } from "@api/challenge";
import { useGameSyncStatus } from "@api/game";
import GameSyncReadonlyBanner from "@lib/blocks/game/sync-readonly-banner";
import { generateRandomMotto } from "@lib/utils/random-motto";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import Select from "@widgets/select";
import { createEffect, createMemo, createSignal, untrack } from "solid-js";
import type { ChallengeWidgetProps } from ".";
import dynamicLeetChecker from "./scripts/dynamic-leet.rx";
import dynamicUuidChecker from "./scripts/dynamic-uuid.rx";
import mappedChecker from "./scripts/mapped.rx";
import simpleChecker from "./scripts/simple.rx";

type PresetChecker = "simple" | "mapped" | "dynamic-leet" | "dynamic-uuid";

const checkerMap = {
  simple: simpleChecker,
  mapped: mappedChecker,
  "dynamic-leet": dynamicLeetChecker,
  "dynamic-uuid": dynamicUuidChecker,
};

// biome-ignore lint/suspicious/noExplicitAny: Context value can be any type
type TmplContext = Record<string, any>;
class Tmpl {
  context: TmplContext;
  constructor(context: TmplContext) {
    this.context = context;
  }

  static withContext(context: TmplContext) {
    return new Tmpl(context);
  }

  // from expression to value
  // biome-ignore lint/suspicious/noExplicitAny: arguments can be any type
  protected handleToken(token: string, callable: boolean, args: any[]) {
    if (!Object.hasOwn(checkerCtx, token)) {
      throw new Error(`Cannot find token in context: ${token}`);
    }
    if (callable) return this.context[token].apply(checkerCtx, args);
    return this.context[token];
  }

  // biome-ignore lint/suspicious/noExplicitAny: everything can income and outcome as string
  private result2str(result: any) {
    if (result === null || typeof result === "undefined") return String(result);
    if (Object.hasOwn(result, "toString")) return result.toString();
    if (Object.hasOwn(Object.getPrototypeOf(result), "toString")) return result.toString();
    return String(result);
  }

  // replace tokens in %token% format
  execute(tmpl: string) {
    const reg = /%([a-zA-Z_]\w*)(\((.*?)\))?%/g;
    return tmpl.replace(reg, (_match, token: string, _callable?: string, _args?: string) => {
      try {
        return this.result2str(this.handleToken(token, !!_callable, _args ? JSON.parse(`[${_args}]`) : []));
      } catch (_err) {
        // console.error(err);
        return _match;
      }
    });
  }
}

const checkerCtx = {
  RANDSTR(n: number) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  },
  MOTTO() {
    return generateRandomMotto();
  },
} as const;

export default function (props: ChallengeWidgetProps) {
  const [preset, setPreset] = createSignal(null as PresetChecker | null);
  const presetChecker = createMemo(() => {
    if (!preset()) return null;
    return Tmpl.withContext(checkerCtx).execute(checkerMap[preset()!]);
  });
  const [script, setScript] = createSignal("");
  const syncStatus = useGameSyncStatus({
    game_id: () => props.gameId,
    enabled: () => props.gameId > 0,
  });

  const scriptRemote = useChallengeCheckerScript({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });

  createEffect(() => {
    if (scriptRemote.data) {
      untrack(() => {
        setScript(scriptRemote.data?.script || "");
      });
    }
  });

  const updateScriptMutation = useUpdateChallengeCheckerScriptMutation({
    onSuccess: () => {
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId],
      });
    },
  });

  function restoreScript() {
    setScript(scriptRemote.data?.script || "");
  }

  createEffect(() => {
    if (presetChecker()) {
      untrack(() => {
        setScript(presetChecker()!);
      });
    }
  });

  return (
    <div class="flex-1 flex flex-col h-full space-y-2 p-3 lg:p-6 lg:pb-3">
      <GameSyncReadonlyBanner gameId={props.gameId} />
      <header class="min-h-12 border-b border-b-layer-content/10 flex flex-row flex-wrap justify-end space-x-2 items-center gap-y-2 py-2">
        <span class="flex flex-row space-x-2 items-center overflow-hidden">
          <span class="shrink-0 icon-[fluent--code-20-regular] w-5 h-5" />
          <span class="font-bold inline-block whitespace-nowrap">{t("challenge.checker.script")}</span>
          <span class="opacity-60 truncate">checker/main.rx</span>
        </span>
        <span class="flex-1" />
        <span class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-2">
          <Select
            class="w-60 min-w-10"
            placeholder={t("challenge.checker.preset.placeholder")}
            size="sm"
            items={[
              {
                label: t("challenge.checker.preset.simple.label"),
                value: "simple",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
              {
                label: t("challenge.checker.preset.leet.label"),
                value: "dynamic-leet",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
              {
                label: t("challenge.checker.preset.uuid.label"),
                value: "dynamic-uuid",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
              {
                label: t("challenge.checker.preset.mapped.label"),
                value: "mapped",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
            ]}
            onValueChange={(e) => {
              setPreset((e.value.at(0) as PresetChecker) || null);
            }}
            disabled={syncStatus.data?.readonly}
          />
          <span class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-2">
            <Button size="sm" square onClick={restoreScript}>
              <span class="shrink-0 icon-[fluent--arrow-reset-20-regular] w-5 h-5" />
            </Button>
            <Button
              level="info"
              size="sm"
              onClick={() => {
                if (syncStatus.data?.readonly) {
                  return;
                }
                updateScriptMutation.mutate({
                  game_id: props.gameId,
                  challenge_id: props.challengeId,
                  content: script(),
                });
              }}
              loading={updateScriptMutation.isPending || scriptRemote.isLoading}
              disabled={updateScriptMutation.isPending || scriptRemote.isLoading || syncStatus.data?.readonly}
            >
              {t("general.actions.save.title")}
              <span>&</span>
              {t("general.actions.compile.title")}
            </Button>
          </span>
        </span>
      </header>
      <EditorBare
        class="w-full h-full"
        lineNumbers
        lang="rune"
        value={script()}
        lints={scriptRemote.data?.lint ?? []}
        readonly={syncStatus.data?.readonly}
        onValueChanged={(e) => {
          if (!syncStatus.data?.readonly) {
            setScript(e);
          }
        }}
      />
      <footer class="min-h-12 border-t border-t-layer-content/10 flex flex-col lg:flex-row flex-wrap justify-start space-x-2 items-center gap-y-2 py-2">
        <span class="text-primary icon-[fluent--info-16-regular]" />
        <span class="text-primary">{scriptRemote.data?.lint?.filter((v) => v.kind === "info").length ?? 0}</span>
        <span class="text-warning icon-[fluent--warning-16-regular]" />
        <span class="text-warning">{scriptRemote.data?.lint?.filter((v) => v.kind === "warning").length ?? 0}</span>
        <span class="text-error icon-[fluent--warning-16-regular]" />
        <span class="text-error">{scriptRemote.data?.lint?.filter((v) => v.kind === "error").length ?? 0}</span>
        <div class="flex-1" />
        <a href="https://rune-rs.github.io/" class="text-primary hover:underline">
          Rune Grammar <span class="icon-[fluent--open-12-regular]" />
        </a>
        <span>&nbsp;&nbsp;</span>
        <a href="https://github.com/ret2shell/ret2script" class="text-primary hover:underline">
          Ret2Script <span class="icon-[fluent--open-12-regular]" />
        </a>
      </footer>
    </div>
  );
}
