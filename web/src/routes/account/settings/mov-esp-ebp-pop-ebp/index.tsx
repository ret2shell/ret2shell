import { handleHttpError } from "@api";
import { deleteSelf } from "@api/account";
import Captcha from "@blocks/captcha";
import { createForm, minLength, required } from "@modular-forms/solid";
import { useNavigate } from "@solidjs/router";
import { accountStore, resetUser } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Input from "@widgets/input";
import { DateTime } from "luxon";
import { createSignal } from "solid-js";

type CaptchaForm = {
  captcha_id: string;
  captcha_answer: string;
};

export default function () {
  const [name, setName] = createSignal("");
  const [form, { Form, Field }] = createForm<CaptchaForm>();
  const navigate = useNavigate();
  const canDelete = () => name() === accountStore.account!;
  const [loading, setLoading] = createSignal(false);
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis());
  async function handleDeactivate(result: CaptchaForm) {
    setLoading(true);
    try {
      await deleteSelf(result);
      resetUser();
      navigate("/");
    } catch (err) {
      handleHttpError(err as Error, t("account.delete.errors.delete.title")!);
      setTimestamp(DateTime.now().toMillis());
    }
    setLoading(false);
  }
  return (
    <>
      <Title page={t("account.delete.title")} route="/account/settings/mov-esp-ebp-pop-ebp" />
      <div class="flex-1 flex flex-row p-4 lg:p-6 justify-center">
        <div class="flex-1 flex flex-col max-w-5xl space-y-2">
          <div class="pt-4 md:p-12 md:pb-4 flex flex-row md:flex-col items-center justify-center">
            <span class="icon-[fluent--warning-24-filled] text-error w-6 h-6 md:w-24 md:h-24" />
            <h1 class="text-center text-lg font-bold text-error ml-4 md:ml-0 md:mt-4">
              {t("account.delete.topWarning")}
            </h1>
          </div>
          <Divider class="w-full" />
          <Card level="warning" contentClass="p-2 flex space-x-2 items-center">
            <span class="icon-[fluent--warning-20-filled] w-5 h-5 text-warning shrink-0" />
            <p class="font-bold">{t("account.delete.canNotDeleteWhenGameInProgress")}</p>
          </Card>
          <article class="article w-full max-w-5xl self-center mt-4">
            <p>
              <strong>{t("account.delete.declare.title")}</strong>
            </p>
            <ul>
              <li>{t("account.delete.declare.1")}</li>
              <li>{t("account.delete.declare.2")}</li>
              <li>{t("account.delete.declare.3")}</li>
              <li>{t("account.delete.declare.4")}</li>
            </ul>
            <p>
              <strong>{t("account.delete.thinkTwice")}</strong>
            </p>
            <p class="text-error">{t("account.delete.confirm", { name: accountStore.account! })}</p>
          </article>
          <Divider class="w-full" />
          <Form
            class="w-full max-w-5xl self-center flex flex-row items-center justify-center"
            onSubmit={handleDeactivate}
          >
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
                      noLabel
                      idFieldError={idField.error}
                      answerFieldValue={answerField.value}
                      answerFieldError={answerField.error}
                      timestamp={timestamp()}
                    />
                  )}
                </Field>
              )}
            </Field>
            <Input
              icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
              extraBtn={
                <Button
                  title={t("account.delete.bye.message")}
                  class="rounded-l-none text-error"
                  disabled={!canDelete() || loading()}
                  loading={loading()}
                >
                  <span class="icon-[fluent--arrow-exit-20-regular] w-5 h-5" />
                  <span class="icon-[fluent--person-walking-20-regular] w-5 h-5" />
                  <span class="hidden md:inline">{t("account.delete.bye.title")}</span>
                </Button>
              }
              class="flex-1 ml-2"
              onInput={(v) => {
                setName(v.target.value);
              }}
            />
          </Form>
          <Divider class="w-full" />
        </div>
      </div>
    </>
  );
}
