import { handleHttpError } from "@api";
import { getCaptcha } from "@api/account";
import Spin from "@assets/animates/spin";
import type { Captcha } from "@models/captcha";
import { type FormStore, type Maybe, setValue } from "@modular-forms/solid";
import { base64 } from "@scure/base";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Input, { type TextInputProps } from "@widgets/input";
import { type ComponentProps, createEffect, createSignal, splitProps, untrack } from "solid-js";

export default function (
  props: TextInputProps &
    ComponentProps<"input"> & {
      // biome-ignore lint/suspicious/noExplicitAny: the options are not ensured
      captchaForm: FormStore<any, undefined>;
      idFieldValue: Maybe<string>;
      idFieldError: string | undefined;
      answerFieldValue: Maybe<string>;
      answerFieldError: string | undefined;
      timestamp?: number;
    }
) {
  const [fieldProps, inputProps] = splitProps(props, ["idFieldValue", "answerFieldValue"]);
  const [captcha, setCaptcha] = createSignal<Captcha | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [calculating, setCalculating] = createSignal(false);
  const [manuallyFill, setManuallyFill] = createSignal(true);

  async function reload() {
    setLoading(true);
    try {
      const resp = await getCaptcha();
      setCaptcha(resp);
      if (resp.validator === "pow") startPow();
      else if (resp.validator === "none") {
        setValue(props.captchaForm, "captcha_answer", "0xDEADBEEF");
        setValue(props.captchaForm, "captcha_id", "0xCAFEBABE");
      }
      setValue(props.captchaForm, "captcha_id", resp.id);
    } catch (err) {
      setCaptcha(null);
      setValue(props.captchaForm, "captcha_id", "");
      handleHttpError(err as Error, t("captcha.errors.fetch.title")!);
    }
    setLoading(false);
  }

  createEffect(() => {
    if (props.timestamp) {
      untrack(reload);
    }
  });

  function getCaptchaContent() {
    const captchaObj = captcha();
    if (captchaObj)
      switch (captchaObj.validator) {
        case "none":
          setManuallyFill(false);
          return <span>NONE</span>;
        case "image":
          setManuallyFill(true);
          return (
            <img
              class="w-20 object-fill"
              src={`data:image/svg+xml;base64,${base64.encode(new TextEncoder().encode(captchaObj.challenge))}`}
              alt={t("general.actions.refresh.title")}
            />
          );
        case "pow":
          setManuallyFill(false);
          return (
            <span class="inline-flex space-x-2 items-center">
              {calculating() ? (
                <>
                  <Spin width={20} height={20} />
                  <span>{t("captcha.calculating")}</span>
                </>
              ) : (
                <span class="icon-[fluent--checkmark-20-regular] w-5 h-5 text-success" />
              )}
            </span>
          );
        case "recaptcha_v3":
          setManuallyFill(false);
          return <span>ReCaptcha V3</span>;
        case "h_captcha":
          setManuallyFill(false);
          return <span>HCaptcha</span>;
      }
  }

  function startPow() {
    setCalculating(true);
    const worker = new Worker(new URL("@lib/workers/pow.worker.ts", import.meta.url), { type: "module" });
    worker.postMessage({
      challenge: captcha()?.challenge,
    });
    worker.onmessage = (e) => {
      setCalculating(false);
      setValue(props.captchaForm, "captcha_answer", e.data);
      worker.terminate();
    };
  }

  return (
    <>
      <input class="hidden" name="captcha_id" value={fieldProps.idFieldValue} />
      <Input
        icon={<span class="icon-[fluent--bot-20-regular] w-5 h-5" />}
        placeholder="0xDEADBEEF"
        title={t("captcha.title")}
        value={fieldProps.answerFieldValue}
        {...inputProps}
        disabled={!manuallyFill()}
        error={props.idFieldError || props.answerFieldError}
        extraBtn={
          <Button
            class="!rounded-l-none"
            loading={loading()}
            onClick={reload}
            disabled={calculating() || loading()}
            type="button"
          >
            {loading() ? t("captcha.fetching") : captcha() ? getCaptchaContent() : t("captcha.errors.fetch.title")}
          </Button>
        }
      />
    </>
  );
}
