import { handleHttpError } from "@api";
import { getChallengeCheckerScript, updateChallengeCheckerScript } from "@api/game";
import type { Challenge } from "@models/challenge";
import { challengeStore } from "@storage/challenge";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import { EditorBare } from "@widgets/editor";
import Select from "@widgets/select";
import Splitter from "@widgets/splitter";
import { AnsiUp } from "ansi_up";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
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

  static with_context(context: TmplContext) {
    return new Tmpl(context);
  }

  // from expression to value
  // biome-ignore lint/suspicious/noExplicitAny: arguments can be any type
  protected handleToken(token: string, callable: boolean, args: any[]) {
    if (!Object.prototype.hasOwnProperty.call(checkerCtx, token)) {
      throw new Error(`Cannot find token in context: ${token}`);
    }
    if (callable) return this.context[token].apply(checkerCtx, args);
    return this.context[token];
  }

  // biome-ignore lint/suspicious/noExplicitAny: everything can income and outcome as string
  private result2str(result: any) {
    if (result === null || typeof result === "undefined") return String(result);
    if (Object.prototype.hasOwnProperty.call(result, "toString")) return result.toString();
    if (Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(result), "toString")) return result.toString();
    return String(result);
  }

  // replace tokens in %token% format
  execute(tmpl: string) {
    const reg = /%([a-zA-Z_]\w*)(\((.*?)\))?%/g;
    return tmpl.replace(reg, (_match, token: string, _callable?: string, _args?: string) => {
      try {
        return this.result2str(this.handleToken(token, !!_callable, _args ? JSON.parse(`[${_args}]`) : []));
      } catch (err) {
        console.error(err);
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
} as const;

export default function (_props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [preset, setPreset] = createSignal(null as PresetChecker | null);
  const presetChecker = createMemo(() => {
    if (!preset()) return null;
    return Tmpl.with_context(checkerCtx).execute(checkerMap[preset()!]);
  });
  const [script, setScript] = createSignal("");
  const [lint, setLint] = createSignal(null as string | null);
  const [renderedLint, setRenderedLint] = createSignal(null as string | null);
  const ansi_up = new AnsiUp();
  ansi_up.use_classes = true;
  let serverScript = "";
  async function refreshScript() {
    const resp = await getChallengeCheckerScript(challengeStore.current!.game_id, challengeStore.current!.id, true);
    serverScript = resp.script;
    setScript(resp.script);
    setLint(resp.lint ?? null);
    if (resp.lint) {
      setRenderedLint(ansi_up.ansi_to_html(resp.lint));
    }
  }
  function restoreScript() {
    setScript(serverScript);
  }
  refreshScript();
  createEffect(() => {
    if (!challengeStore.current?.hidden) {
      untrack(refreshScript);
    }
  });

  createEffect(() => {
    if (presetChecker()) {
      untrack(() => {
        setScript(presetChecker()!);
      });
    }
  });

  async function handleUpdateScript() {
    try {
      await updateChallengeCheckerScript(challengeStore.current!.game_id, challengeStore.current!.id, script());
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
      refreshScript();
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
  }

  return (
    <div class="flex-1 flex flex-col h-full space-y-2 p-3 lg:p-6">
      <header class="min-h-12 border-b border-b-layer-content/10 flex flex-row flex-wrap justify-end space-x-2 items-center gap-y-2 py-2">
        <span class="flex flex-row space-x-2 items-center overflow-hidden">
          <span class="icon-[fluent--code-20-regular] w-5 h-5 shrink-0" />
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
                label: t("challenge.checker.preset.simple.label")!,
                value: "simple",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
              {
                label: t("challenge.checker.preset.leet.label")!,
                value: "dynamic-leet",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
              {
                label: t("challenge.checker.preset.uuid.label")!,
                value: "dynamic-uuid",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
              {
                label: t("challenge.checker.preset.mapped.label")!,
                value: "mapped",
                icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
              },
            ]}
            onValueChange={(e) => {
              setPreset((e.value.at(0) as PresetChecker) || null);
            }}
          />
          <span class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-2">
            <Button size="sm" square onClick={restoreScript}>
              <span class="icon-[fluent--arrow-reset-20-regular] w-5 h-5" />
            </Button>
            <Button level="info" size="sm" onClick={handleUpdateScript}>
              {t("general.actions.save.title")}
              <span>&</span>
              {t("general.actions.compile.title")}
            </Button>
          </span>
        </span>
      </header>
      <Splitter
        orientation="vertical"
        defaultSize={[80, 20]}
        panels={[
          { id: "a", minSize: 24 },
          { id: "b", minSize: 10 },
        ]}
        class="flex-1"
        startPanel={() => (
          <EditorBare
            class="w-full h-full"
            lineNumbers
            lang="rust"
            value={script()}
            onValueChanged={(e) => {
              setScript(e);
            }}
          />
        )}
        endPanel={() => (
          <OverlayScrollbarsComponent
            options={{
              scrollbars: {
                theme: `os-theme-${fullTheme()}`,
                autoHide: "scroll",
              },
            }}
            class="relative w-full h-full print:h-auto print:overflow-auto"
            defer
          >
            <Show
              when={lint()}
              fallback={
                <p class="flex flex-row space-x-2 items-center text-success p-3 lg:p-6">
                  <span class="icon-[fluent--thumb-like-20-regular] w-5 h-5" />
                  <span>0 warning(s), error(s).</span>
                </p>
              }
            >
              <div class="p-3 lg:p-6">
                <pre innerHTML={renderedLint() ?? undefined} />
              </div>
            </Show>
          </OverlayScrollbarsComponent>
        )}
      />
    </div>
  );
}
