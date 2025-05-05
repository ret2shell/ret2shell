import { handleHttpError } from "@api";
import { forgotPassword } from "@api/account";
import Captcha from "@blocks/captcha";
import { createForm, email, minLength, required } from "@modular-forms/solid";
import { useNavigate } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import { HTTPError } from "ky";
import { DateTime } from "luxon";
import { createSignal } from "solid-js";

type ForgotForm = {
  email: string;
  captcha_id: string;
  captcha_answer: string;
};

export default function () {
  const [form, { Form, Field }] = createForm<ForgotForm>();
  const [loading, setLoading] = createSignal(false);
  const navigate = useNavigate();
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis());
  function handleSubmit(data: ForgotForm) {
    setLoading(true);
    setTimeout(async () => {
      try {
        await forgotPassword(data);
        addToast({
          level: "success",
          description: t("account.forgot.status.success.message")!,
          duration: 5000,
        });
        navigate("/", { replace: true });
      } catch (err) {
        if (err instanceof HTTPError && err.response.status === 429) {
          addToast({
            level: "error",
            description: t("account.forgot.status.rateExceeded.message")!,
            duration: 5000,
          });
        } else {
          handleHttpError(err as Error, t("general.actions.create.status.fail")!);
          setTimestamp(DateTime.now().toMillis());
        }
      }
      setLoading(false);
    }, 500);
  }
  return (
    <>
      <Title page={t("account.forgot.title")} route="/account/forgot" />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-md"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={handleSubmit} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("account.forgot.title")}</h2>
            <Field
              name="email"
              validate={[
                required(t("account.forgot.form.email.required")!),
                email(t("account.forgot.form.email.invalid")!),
              ]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5" />}
                  placeholder={t("account.forgot.form.email.placeholder")}
                  title={t("account.forgot.form.email.label")}
                  autocomplete="email"
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
                    minLength(4, t("captcha.form.answer.required")!),
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
              {t("general.actions.send.title")}
            </Button>
          </Form>
        </Card>
      </div>
    </>
  );
}
