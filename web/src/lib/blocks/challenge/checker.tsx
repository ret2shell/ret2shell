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

class Tmpl {
  context: Record<string, any>;
  constructor(context: Record<string, any>) {
    this.context = context;
  }

  static with_context(context: Record<string, any>) {
    return new Tmpl(context);
  }

  // from expression to value
  protected handleToken(token: string, callable: boolean, args: any[]) {
    if (!Object.prototype.hasOwnProperty.call(checkerCtx, token)) {
      throw new Error(`Cannot find token in context: ${token}`);
    }
    if (callable) return this.context[token].apply(checkerCtx, args);
    return this.context[token];
  }

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
  async function refreshScript() {
    const resp = await getChallengeCheckerScript(challengeStore.current!.game_id, challengeStore.current!.id, true);
    setScript(resp.script);
    setLint(resp.lint ?? null);
    if (resp.lint) {
      setRenderedLint(ansi_up.ansi_to_html(resp.lint));
    }
  }
  createEffect(() => {
    if (challengeStore.current) {
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
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("form.saveFailed")!);
    }
    refreshScript();
  }

  return (
    <div class="flex-1 h-full flex flex-col">
      <header class="h-12 border-b border-b-layer-content/10 flex flex-row space-x-2 px-2 items-center">
        <span class="icon-[fluent--code-20-regular] w-5 h-5" />
        <span class="font-bold hidden lg:inline-block">{t("game.challenge.checkerScript")}</span>
        <span class="opacity-60">checker/main.rx</span>
        <div class="flex-1" />
        <Select
          class="w-60 hidden lg:flex"
          placeholder={t("game.challenge.selectPresetScripts")}
          size="sm"
          items={[
            {
              label: t("game.challenge.simpleCheckerScriptPreset")!,
              value: "simple",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
            {
              label: t("game.challenge.dynamicLeetCheckerScriptPreset")!,
              value: "dynamic-leet",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
            {
              label: t("game.challenge.dynamicUuidCheckerScriptPreset")!,
              value: "dynamic-uuid",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
            {
              label: t("game.challenge.mappedCheckerScriptPreset")!,
              value: "mapped",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
          ]}
          onValueChange={(e) => {
            setPreset((e.value.at(0) as PresetChecker) || null);
          }}
        />
        <Button level="info" size="sm" onClick={handleUpdateScript}>
          {t("form.saveAndCompile")}
        </Button>
      </header>
      <Splitter
        orientation="vertical"
        size={[
          { id: "a", size: 80, minSize: 24 },
          { id: "b", size: 20, minSize: 10 },
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
