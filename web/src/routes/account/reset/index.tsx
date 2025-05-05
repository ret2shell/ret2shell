import { handleHttpError } from "@api";
import { resetPassword } from "@api/account";
import Captcha from "@blocks/captcha";
import { createForm, email, minLength, pattern, required, setValue } from "@modular-forms/solid";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import { DateTime } from "luxon";
import { createSignal } from "solid-js";

type ResetForm = {
  email: string;
  token: string;
  password: string;
  captcha_id: string;
  captcha_answer: string;
};

export default function () {
  const [form, { Form, Field }] = createForm<ResetForm>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailPredef = searchParams.email;
  const tokenPredef = searchParams.token;
  if (!emailPredef || !tokenPredef) {
    addToast({
      level: "error",
      description: t("account.reset.errors.invalidLink.title")!,
      duration: 5000,
    });
    navigate("/sigtrap/403", { replace: true });
    return null;
  }
  setValue(form, "email", emailPredef as string);
  setValue(form, "token", tokenPredef as string);
  const [loading, setLoading] = createSignal(false);
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis());
  function handleSubmit(data: ResetForm) {
    setLoading(true);
    setTimeout(async () => {
      try {
        await resetPassword(data);
        addToast({
          level: "success",
          description: t("account.reset.status.success.message")!,
          duration: 5000,
        });
        navigate("/", { replace: true });
      } catch (err) {
        handleHttpError(err as Error, t("account.reset.errors.reset.title")!);
        setTimestamp(DateTime.now().toMillis());
      }
      setLoading(false);
    }, 500);
  }
  return (
    <>
      <Title page={t("account.reset.title")} route="/account/reset" />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-md"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={handleSubmit} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("account.reset.title")}</h2>
            <input
              class="hidden"
              type="text"
              name="username"
              value={accountStore.account!}
              autocomplete="username"
              disabled
            />
            <Field
              name="email"
              validate={[required(t("account.form.email.required")!), email(t("account.form.email.invalid")!)]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5" />}
                  placeholder={t("account.form.email.placeholder")}
                  disabled
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
            <Field name="token" validate={[required(t("account.reset.form.token.required")!)]}>
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--key-20-regular] w-5 h-5" />}
                  placeholder={t("account.reset.form.token.placeholder")}
                  disabled
                  title={t("account.reset.form.token.label")}
                  autocomplete="off"
                  {...props}
                  value={field.value}
                  error={field.error}
                  class="flex-1"
                  required
                />
              )}
            </Field>
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
            <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
              {t("general.actions.confirm.title")}
            </Button>
          </Form>
        </Card>
      </div>
    </>
  );
}
