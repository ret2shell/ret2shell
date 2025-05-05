import { handleHttpError } from "@api";
import { register, registerWithOAuth } from "@api/account";
import { deunicode, leet } from "@api/rpc";
// import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
import Captcha from "@blocks/captcha";
import { createForm, email, maxLength, minLength, pattern, required, setValue } from "@modular-forms/solid";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import { DateTime } from "luxon";
import { Show, createSignal } from "solid-js";

type RegisterForm = {
  account: string;
  nickname: string;
  email: string;
  password: string;
  captcha_id: string;
  captcha_answer: string;
};

export default function () {
  const navigate = useNavigate();
  if (accountStore.token) {
    navigate("/", { replace: true });
    return null;
  }
  const [form, { Form, Field }] = createForm<RegisterForm>();
  const [loading, setLoading] = createSignal(false);
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis());
  let accountInputRef: HTMLInputElement;
  const [searchParams, _] = useSearchParams();

  function onSubmit(result: RegisterForm) {
    setLoading(true);
    setTimeout(async () => {
      try {
        if (searchParams.token && searchParams.auth_key) {
          await registerWithOAuth(searchParams.token as string, result);
        } else {
          await register(result);
        }
        addToast({
          level: "success",
          description: t("account.register.status.success.message")!,
          duration: 5000,
          // img: xdsecMascotHappy,
        });
        navigate("/", { replace: true });
      } catch (err) {
        handleHttpError(err as Error, t("account.register.errors.register.title")!);
        setTimestamp(DateTime.now().toMillis());
      }
      setLoading(false);
    }, 500);
  }

  return (
    <>
      <Title page={t("account.register.title")} route="/account/register" />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-3xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={onSubmit} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("account.register.title")}</h2>
            <Show when={searchParams.token && searchParams.auth_key}>
              <Card level="info" class="w-full" contentClass="p-2">
                <p>
                  {t("account.register.oauthRegister", {
                    key: searchParams.auth_key as string,
                  })}
                </p>
              </Card>
            </Show>
            <div class="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
              <Field
                name="nickname"
                validate={[
                  required(t("account.form.nickname.required")!),
                  minLength(2, t("account.form.nickname.minLength")!),
                  maxLength(32, t("account.form.nickname.maxLength")!),
                ]}
              >
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--wand-20-regular] w-5 h-5" />}
                    placeholder={t("account.form.nickname.placeholder")}
                    title={t("account.form.nickname.label")}
                    autocomplete="nickname"
                    {...props}
                    value={field.value}
                    error={field.error}
                    class="flex-1"
                    required
                    onBlur={async (e) => {
                      if (e.target.value) {
                        try {
                          setValue(form, "account", await deunicode(e.target.value));
                        } catch {}
                      }
                    }}
                  />
                )}
              </Field>
              <Field
                name="account"
                validate={[
                  required(t("account.form.account.required")!),
                  minLength(4, t("account.form.account.minimumLength")!),
                  maxLength(32, t("account.form.account.maximumLength")!),
                  // only ascii visible characters, no whitespaces
                  pattern(/^[0-9a-zA-Z_]*$/, t("account.form.account.invalid")!),
                ]}
              >
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
                    placeholder={t("account.form.account.placeholder")}
                    title={t("account.form.account.label")}
                    autocomplete="username"
                    {...props}
                    value={field.value}
                    error={field.error}
                    class="flex-1"
                    required
                    ref={accountInputRef!}
                    extraBtn={
                      <Button
                        class="!rounded-l-none"
                        type="button"
                        onClick={async () => {
                          if (accountInputRef! && accountInputRef.value) {
                            try {
                              setValue(form, "account", await leet(accountInputRef!.value));
                            } catch {}
                          }
                        }}
                      >
                        <span class="icon-[fluent--diversity-20-regular] w-5 h-5" />
                      </Button>
                    }
                  />
                )}
              </Field>
            </div>
            <Field
              name="email"
              validate={[required(t("account.form.email.required")!), email(t("account.form.email.invalid")!)]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5" />}
                  placeholder={t("account.form.email.placeholder")}
                  title={t("account.form.email.label")}
                  autocomplete="email"
                  {...props}
                  value={field.value}
                  error={field.error}
                  class="flex-1"
                  required
                />
              )}
            </Field>
            <div class="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
              <Field
                name="password"
                validate={[
                  required(t("account.form.password.required")!),
                  minLength(8, t("account.form.password.minimumLength")!),
                  pattern(
                    // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: password allows any characters
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^]{8,40}$/,
                    t("account.form.password.tooWeak")!
                  ),
                ]}
              >
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5" />}
                    placeholder={t("account.form.password.placeholder")}
                    title={t("account.form.password.label")}
                    autocomplete="new-password"
                    type="password"
                    {...props}
                    value={field.value}
                    error={field.error}
                    class="flex-1"
                    required
                  />
                )}
              </Field>
              <Field name="captcha_id">
                {(idField) => (
                  <Field
                    name="captcha_answer"
                    validate={[
                      required(t("captcha.form.answer.required")!),
                      minLength(4, t("captcha.form.answer.minimumLength")!),
                    ]}
                  >
                    {(answerField, props) => (
                      <Captcha
                        {...props}
                        captchaForm={form}
                        class="flex-1"
                        idFieldValue={idField.value}
                        idFieldError={idField.error}
                        answerFieldValue={answerField.value}
                        answerFieldError={answerField.error}
                        timestamp={timestamp()}
                      />
                    )}
                  </Field>
                )}
              </Field>
            </div>
            <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
              {t("account.register.title")}
            </Button>
          </Form>
        </Card>
      </div>
    </>
  );
}
