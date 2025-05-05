import { handleHttpError } from "@api";
import { getOAuthProviders, login } from "@api/account";
import LogoAnimate from "@assets/animates/logo-animate";
// import xdsecMascotCrying from "@assets/imgs/xdsec-mascot-crying.webp";
// import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
// import xdsecMascotNormal from "@assets/imgs/xdsec-mascot-normal.webp";
// import xdsecMascotUnsee from "@assets/imgs/xdsec-mascot-unsee.webp";
import Captcha from "@blocks/captcha";
import { mediaPath } from "@lib/utils/media";
import type { OAuthProvider } from "@models/oauth-provider";
import { createForm, minLength, pattern, required, setValue } from "@modular-forms/solid";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Input from "@widgets/input";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import { DateTime } from "luxon";
import { For, Match, Switch, createSignal, onMount } from "solid-js";

type LoginForm = {
  account: string;
  password: string;
  captcha_id: string;
  captcha_answer: string;
};

export default function () {
  const navigate = useNavigate();
  const location = useLocation();
  if (accountStore.token) {
    navigate("/", { replace: true });
    return null;
  }
  const [form, { Form, Field }] = createForm<LoginForm>();
  const [oauthServices, setOAuthServices] = createSignal([] as OAuthProvider[]);

  onMount(async () => {
    try {
      setOAuthServices(await getOAuthProviders());
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.errors.fetchProvider.title")!);
    }
  });

  const [_, setMascot] = createSignal(null as string | null);
  const [loading, setLoading] = createSignal(false);
  const [timestamp, setTimestamp] = createSignal(DateTime.now().toMillis());
  function handleLogin(result: LoginForm) {
    setLoading(true);
    setTimeout(async () => {
      try {
        await login(result);
        addToast({
          level: "success",
          description: t("account.login.status.success.message")!,
          duration: 5000,
          // img: xdsecMascotHappy,
        });
        const redirectUrl = location.query.redirect;
        if (redirectUrl) {
          const url = Array.isArray(redirectUrl) ? redirectUrl[0] : redirectUrl;
          if (/^(\w+):\/\//.test(url)) {
            navigate("/", { replace: true });
            window.location.replace(url);
          } else {
            navigate(url, { replace: true });
          }
        } else {
          navigate("/", { replace: true });
        }
      } catch (err) {
        handleHttpError(err as Error, t("account.login.errors.login.title")!);
        setTimestamp(DateTime.now().toMillis());
        setValue(form, "password", "");
        // setTimeout(() => {
        //   setMascot(xdsecMascotCrying);
        // }, 500);
      }
      setLoading(false);
    }, 500);
  }
  return (
    <>
      <Title page={t("account.login.title")} route="/account/login" />
      <div class="flex-1 flex flex-col items-center md:justify-center p-3 md:p-6">
        <Card
          class="w-full max-w-3xl"
          contentClass="p-6 flex flex-col md:flex-row space-y-2 space-x-0 md:space-x-6 md:space-y-0"
        >
          <Form onSubmit={handleLogin} class="md:w-0 flex-1 shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("account.login.title")}</h2>
            <Field
              name="account"
              validate={[
                required(t("account.form.account.required")!),
                minLength(4, t("account.form.account.minimumLength")!),
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
                  required
                  onFocusIn={() => {
                    // setMascot(xdsecMascotNormal);
                  }}
                  onFocusOut={() => {
                    setMascot(null);
                  }}
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
                  type="password"
                  placeholder={t("account.form.password.placeholder")}
                  title={t("account.form.password.label")}
                  extraLabel={
                    <A href="/account/forgot" class="hover:underline flex items-center space-x-1">
                      <span class="icon-[fluent--question-circle-16-regular] w-4 h-4 text-primary" />
                      <span>{t("account.forgot.title")}</span>
                    </A>
                  }
                  autocomplete="current-password"
                  {...props}
                  value={field.value}
                  error={field.error}
                  onFocusIn={() => {
                    // setMascot(xdsecMascotUnsee);
                  }}
                  onFocusOut={() => {
                    setMascot(null);
                  }}
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
              {t("account.login.title")}
            </Button>
          </Form>
          <Divider class="md:hidden" />
          <Divider class="hidden md:inline-block" direction="vertical" />
          <div class="md:w-0 flex-1 shrink-0 flex flex-col items-center space-y-2">
            <div class="flex-1 flex flex-col items-center justify-center">
              <LogoAnimate class="w-36 h-36 hidden md:inline-block my-6" />
            </div>
            <Link class="w-full" href="/account/register">
              {t("account.register.tips")}
            </Link>
            <Switch>
              <Match when={oauthServices().filter((s) => s.portal).length === 1}>
                {(() => {
                  const svc = oauthServices().find((s) => s.portal)!;
                  return (
                    <Link class="w-full !mt-4" href={svc.portal} title={svc.name}>
                      <img src={mediaPath(svc.avatar ?? "")} alt={svc.name} width={24} height={24} />
                      <span>{svc.name}</span>
                    </Link>
                  );
                })()}
              </Match>
              <Match when={oauthServices().filter((s) => s.portal).length > 1}>
                <Popover
                  class="w-full !mt-4"
                  btnContent={
                    <>
                      <span class="icon-[fluent--person-passkey-20-regular] w-5 h-5" />
                      <span>{t("account.oauth.select")}</span>
                    </>
                  }
                >
                  <Card contentClass="p-2 flex flex-col space-y-2">
                    <For each={oauthServices().filter((s) => s.portal)}>
                      {(service) => (
                        <Link class="w-full" justify="start" size="sm" href={service.portal} title={service.name} ghost>
                          <img src={mediaPath(service.avatar ?? "")} alt={service.name} width={24} height={24} />
                          <span>{service.name}</span>
                        </Link>
                      )}
                    </For>
                  </Card>
                </Popover>
              </Match>
            </Switch>
          </div>
        </Card>
      </div>
    </>
  );
}
