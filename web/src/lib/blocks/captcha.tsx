import { useCaptcha } from "@api/account";
import Working from "@assets/animates/working";
import { type FormStore, type Maybe, setValue } from "@modular-forms/solid";
import { base64 } from "@scure/base";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Input, { type TextInputProps } from "@widgets/input";
import { type ComponentProps, createEffect, createSignal, on, splitProps, untrack } from "solid-js";

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
  const [calculating, setCalculating] = createSignal(false);
  const [manuallyFill, setManuallyFill] = createSignal(true);

  const captcha = useCaptcha({ timestamp: () => props.timestamp });

  function resetCaptchaFields() {
    setValue(props.captchaForm, "captcha_answer", "");
    setValue(props.captchaForm, "captcha_id", "");
  }

  createEffect(
    on(
      () => props.timestamp,
      () => resetCaptchaFields(),
      { defer: true }
    )
  );

  createEffect(() => {
    if (!captcha.isLoading && captcha.data) {
      untrack(() => {
        if (captcha.data.validator === "pow") startPow();
        else if (captcha.data.validator === "none") {
          setValue(props.captchaForm, "captcha_answer", "0xDEADBEEF");
          setValue(props.captchaForm, "captcha_id", "0xCAFEBABE");
        }
        setValue(props.captchaForm, "captcha_id", captcha.data.id);
      });
    }
  });

  function getCaptchaContent() {
    const captchaObj = captcha.data;
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
                <Working width={20} height={20} />
              ) : (
                <span class="shrink-0 icon-[fluent--checkmark-20-regular] w-5 h-5 text-success" />
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
      challenge: captcha.data?.challenge,
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
        icon={<span class="shrink-0 icon-[fluent--bot-20-regular] w-5 h-5" />}
        placeholder="0xDEADBEEF"
        title={t("captcha.title")}
        value={fieldProps.answerFieldValue}
        {...inputProps}
        disabled={!manuallyFill()}
        error={props.idFieldError || props.answerFieldError}
        extraBtn={
          <Button
            class="rounded-l-none!"
            loading={calculating() || captcha.isLoading}
            onClick={() => {
              resetCaptchaFields();
              captcha.refetch();
            }}
            disabled={calculating() || captcha.isLoading}
            type="button"
            title={
              captcha.isLoading
                ? t("captcha.fetching")
                : calculating()
                  ? t("captcha.calculating")
                  : t("general.actions.refresh.title")
            }
          >
            {calculating() || captcha.isLoading
              ? null
              : captcha.data
                ? getCaptchaContent()
                : t("captcha.errors.fetch.title")}
          </Button>
        }
      />
    </>
  );
}
