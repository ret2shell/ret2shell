import { handleHttpError } from "@api";
import { login } from "@api/account";
import { getAuthConfig } from "@api/platform";
import LogoAnimate from "@assets/animates/logo-animate";
import xdu from "@assets/brands/xdu.svg";
import xmu from "@assets/brands/xmu.svg";
// import xdsecMascotCrying from "@assets/imgs/xdsec-mascot-crying.webp";
// import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
// import xdsecMascotNormal from "@assets/imgs/xdsec-mascot-normal.webp";
// import xdsecMascotUnsee from "@assets/imgs/xdsec-mascot-unsee.webp";
import Captcha from "@blocks/captcha";
import type { AuthConfig } from "@models/config";
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
import { DateTime } from "luxon";
import { Show, createMemo, createSignal, onMount } from "solid-js";

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
  const [authConfig, setAuthConfig] = createSignal({
    signing_key: "",
    buffer_time: 0,
    expires_time: 0,
    oauth_keys: {},
  } as AuthConfig);

  onMount(async () => {
    try {
      setAuthConfig(await getAuthConfig());
    } catch (err) {
      handleHttpError(err as Error, t("errors.unknown")!);
    }
  });

  const oauthServices = createMemo(() => Object.keys(authConfig().oauth_keys || {}));
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
          description: t("account.login.success")!,
          duration: 5000,
          // img: xdsecMascotHappy,
        });
        const redirectUrl = location.query.redirect;
        if (redirectUrl) {
          navigate(redirectUrl as string, { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      } catch (err) {
        handleHttpError(err as Error, t("account.login.failMascotTip")!);
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
          <Form onSubmit={handleLogin} class="md:w-0 flex-1 flex-shrink-0 flex flex-col space-y-2">
            <h2 class="font-bold text-center">{t("account.login.title")}</h2>
            <Field
              name="account"
              validate={[
                required(t("account.login.accountRequired")!),
                minLength(4, t("account.login.accountMinLength")!),
              ]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
                  placeholder={t("account.login.accountPlaceholder")}
                  title={t("account.login.accountPlaceholder")}
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
                required(t("account.login.passwordRequired")!),
                minLength(8, t("account.login.passwordMinLength")!),
                pattern(
                  // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: password allows any characters
                  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^]{8,40}$/,
                  t("account.login.passwordTooWeak")!
                ),
              ]}
            >
              {(field, props) => (
                <Input
                  icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5" />}
                  type="password"
                  placeholder={t("account.login.passwordPlaceholder")}
                  title={t("account.login.passwordPlaceholder")}
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
                  validate={[required(t("captcha.required")!), minLength(4, t("captcha.minLength")!)]}
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
          <div class="md:w-0 flex-1 flex-shrink-0 flex flex-col items-center space-y-2">
            <div class="flex-1 flex flex-col items-center justify-center">
              <LogoAnimate class="w-36 h-36 hidden md:inline-block my-6" />
              {/* <Switch fallback={<LogoAnimate class="w-36 h-36 hidden md:inline-block my-6" />}> */}
              {/*   <Match when={mascot() === xdsecMascotNormal}> */}
              {/*     <img */}
              {/*       src={xdsecMascotNormal} */}
              {/*       class="w-36 h-36 hidden md:inline-block my-6" */}
              {/*       alt="Illustrated by hypnotics" */}
              {/*       title="Illustrated by hypnotics" */}
              {/*     /> */}
              {/*     <header>{t("account.login.accountMascotTip")}</header> */}
              {/*   </Match> */}
              {/*   <Match when={mascot() === xdsecMascotUnsee}> */}
              {/*     <img */}
              {/*       src={xdsecMascotUnsee} */}
              {/*       class="w-36 h-36 hidden md:inline-block my-6" */}
              {/*       alt="Illustrated by hypnotics" */}
              {/*       title="Illustrated by hypnotics" */}
              {/*     /> */}
              {/*     <header>{t("account.login.passwordMascotTip")}</header> */}
              {/*   </Match> */}
              {/*   <Match when={mascot() === xdsecMascotHappy}> */}
              {/*     <img */}
              {/*       src={xdsecMascotHappy} */}
              {/*       class="w-36 h-36 hidden md:inline-block my-6" */}
              {/*       alt="Illustrated by hypnotics" */}
              {/*       title="Illustrated by hypnotics" */}
              {/*     /> */}
              {/*     <header>{t("account.login.successMascotTip")}</header> */}
              {/*   </Match> */}
              {/*   <Match when={mascot() === xdsecMascotCrying}> */}
              {/*     <img */}
              {/*       src={xdsecMascotCrying} */}
              {/*       class="w-36 h-36 hidden md:inline-block my-6" */}
              {/*       alt="Illustrated by hypnotics" */}
              {/*       title="Illustrated by hypnotics" */}
              {/*     /> */}
              {/*     <header>{t("account.login.failMascotTip")}</header> */}
              {/*   </Match> */}
              {/* </Switch> */}
            </div>
            <Link class="w-full" href="/account/register">
              {t("account.register.tips")}
            </Link>
            <Show when={authConfig().oauth_keys !== null && (oauthServices().length || 0) > 0}>
              <div class="flex flex-row flex-wrap space-x-2 items-start w-full">
                <Show when={oauthServices().find((s) => s === "xdu_cas")}>
                  <Link
                    class="flex-1"
                    href={`https://ids.xidian.edu.cn/authserver/login?service=${window.location.origin}/account/oauth?service=xdu_cas`}
                    title={t("account.oauth.xdu.title")}
                  >
                    <img src={xdu} alt="XDU" width={24} height={24} />
                    <span>XDU</span>
                  </Link>
                </Show>
                <Show when={oauthServices().find((s) => s === "xmu_cas")}>
                  <Link
                    class="flex-1"
                    href={`https://ids.xmu.edu.cn/authserver/login?service=${window.location.origin}/account/oauth?service=xmu_cas`}
                    title={t("account.oauth.xmu.title")}
                  >
                    <img src={xmu} alt="XMU" width={24} height={24} />
                    <span>XMU</span>
                  </Link>
                </Show>
                {/* <Show when={(authConfig().oauth_keys || []).find((s) => s.service === "google")}>
                  <Link href="/account/oauth?type=redirect&service=google" square>
                    <Google width={24} height={24} />
                  </Link>
                </Show>
                <Show when={(authConfig().oauth_keys || []).find((s) => s.service === "github")}>
                  <Link href="/account/oauth?type=redirect&service=github" square>
                    <Github width={24} height={24} />
                  </Link>
                </Show>
                <Show when={(authConfig().oauth_keys || []).find((s) => s.service === "gitlab")}>
                  <Link href="/account/oauth?type=redirect&service=gitlab" square>
                    <Gitlab width={24} height={24} />
                  </Link>
                </Show> */}
              </div>
            </Show>
          </div>
        </Card>
      </div>
    </>
  );
}
