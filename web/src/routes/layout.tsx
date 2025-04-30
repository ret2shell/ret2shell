import { handleHttpError } from "@api";
import { getPlatformInfo, getPlatformLicense, getVersion } from "@api/platform";
import Background from "@blocks/background";
import { Permission } from "@models/user";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { frontendCompatVersion, platformStore, setPlatformStore } from "@storage/platform";
import { t } from "@storage/theme";
import { addToast, removeToast } from "@storage/toast";
import { HTTPError } from "ky";
import { type JSX, Show, createEffect, createSignal, onMount, untrack } from "solid-js";
import { Transition } from "solid-transition-group";
import TitleBar from "./_blocks/title-bar";
import Toasts from "./_blocks/toasts";

function checkCookiePolicy() {
  if (!platformStore.accept_cookies) {
    const toastId = addToast({
      level: "info",
      description: t("platform.cookiePolicy")!,
      accept: () => {
        setPlatformStore({ accept_cookies: true });
        setTimeout(() => {
          removeToast(toastId);
        }, 50);
      },
      acceptLabel: t("general.actions.ok.title"),
      reject: () => {
        setPlatformStore({ accept_cookies: true });
        setTimeout(() => {
          removeToast(toastId);
        }, 50);
      },
      rejectLabel: t("general.actions.yes.title"),
    });
  }
}

export default function (props: { children?: JSX.Element }) {
  let platformName = `\xa0\xa0[\xa0${platformStore.config.name || t("platform.name")}\xa0]\xa0`;
  const [platformTyped, setPlatformTyped] = createSignal("");
  const [hideAnimation, setHideAnimation] = createSignal(false);
  const showAnimation = useLocation().pathname === "/" && useSearchParams()[0].event === undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const inDocs = () => location.pathname.startsWith("/docs");
  function checkEmailVerification() {
    if (accountStore.token && !accountStore.permissions.includes(Permission.Verified)) {
      addToast({
        level: "warning",
        description: t("account.status.unverified.message")!,
        accept: () => {
          navigate("/account/settings");
        },
        acceptLabel: t("general.actions.goto.title"),
      });
    }
  }

  onMount(async () => {
    try {
      const res = await getPlatformInfo();
      setPlatformStore({
        config: res,
        backend_online: true,
      });
      loadVersion();
    } catch (err) {
      if (err instanceof HTTPError && err.response?.status === 503) {
        setPlatformStore({ under_maintenance: true });
        if (!inDocs()) navigate("/");
      } else if (err instanceof HTTPError && err.response?.status === 502 && !inDocs()) {
        addToast({
          level: "error",
          description: `${t("platform.errors.offline.title")}: ${t("platform.errors.offline.message")}`,
        });
        navigate(`/sigtrap/${err.response?.status || 502}`);
      } else if (err instanceof HTTPError && !inDocs()) {
        addToast({
          level: "error",
          description: `${t("platform.errors.internal.title")}: ${err.response?.statusText || err.message}`,
        });
        navigate(`/sigtrap/${err.response?.status || 500}`);
      } else {
        handleHttpError(err as Error, t("platform.errors.internal.title")!);
        navigate("/sigtrap/unknown");
      }
      setPlatformStore({ backend_online: false });
    }
    platformName = `\xa0\xa0[\xa0${platformStore.config.name || t("platform.name")}\xa0]\xa0`;

    setTimeout(checkCookiePolicy, 1000);

    if (showAnimation) {
      setTimeout(() => {
        const typeTimer = setInterval(() => {
          if (platformTyped().length < platformName.length) {
            setPlatformTyped(platformName.slice(0, platformTyped().length + 1));
          } else {
            clearInterval(typeTimer);
            setTimeout(() => {
              setHideAnimation(true);
            }, 500);
          }
        }, 100);
      }, 1000);
    }
  });

  async function loadVersion() {
    try {
      const version = await getVersion();
      setPlatformStore({ version, under_maintenance: false, backend_online: true });
      if (!version.startsWith(frontendCompatVersion)) {
        addToast({
          level: "warning",
          description: `${t("platform.errors.versionMismatch.title")}: ${t("platform.errors.versionMismatch.message", {
            frontend: frontendCompatVersion,
            backend: version,
          })}`,
        });
      }
      console.log(
        `\n%cR%cet %c2 %cS%chell %cv%c${version}\n\n%cCopyright (c) 2022 - ${new Date().getFullYear()} %cRet 2 Shell%c, All rights reserved.\n`,
        "color: #0078D6; font-weight: bold; font-size: 1.5rem;",
        "color: currentColor; font-weight: bold; font-size: 1.5rem;",
        "color: #808080; font-weight: bold; font-size: 1.5rem;",
        "color: #f83030; font-weight: bold; font-size: 1.5rem;",
        "color: currentColor; font-weight: bold; font-size: 1.5rem;",
        "color: #0078D6",
        "color: #808080",
        "color: #808080",
        "color: #808080;text-decoration: underline;",
        "color: #808080;"
      );
      console.log(
        "\n%cHaving issue? You can open a ticket on https://github.com/ret2shell, any bug reports or feature requests are welcome.\n",
        "color: currentColor;"
      );
      console.log(
        "\n%cIf you want to self-host CTF platforms or look for further cooperating, please contact <support@ret.sh.cn>.\n",
        "color: currentColor;"
      );

      const resp = await getPlatformLicense();
      setPlatformStore({ license: resp });
    } catch (err) {
      setPlatformStore({ version: `${frontendCompatVersion}-UNKNOWN-0.0.0` });
      if (err instanceof HTTPError && err.response?.status === 503) {
        setPlatformStore({ under_maintenance: true, backend_online: false });
        if (!inDocs()) navigate("/");
      }
    }
  }

  createEffect(() => {
    if (accountStore.token) {
      untrack(() => {
        setTimeout(() => {
          checkEmailVerification();
        }, 1000);
      });
    }
  });

  return (
    <>
      <Title domain={platformStore.config.name ?? t("platform.name")} route="/" />
      <Background />
      <TitleBar />
      {props.children}
      <Toasts />
      <Transition
        onExit={async (el: Element, done: () => void) => {
          const a = el.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 300,
          });
          await a.finished;
          done();
        }}
      >
        <Show when={showAnimation && !hideAnimation()}>
          <div class="fixed top-0 left-0 w-screen h-screen bg-layer z-50 print:hidden">
            <Background />
            <div class="w-full h-full flex flex-col items-center pt-16 pb-24">
              <div class="flex-1" />
              <h1 class="text-3xl font-bold z-50 opacity-80">
                {platformTyped()}
                <span class="text-primary animate-ping">_</span>
              </h1>
              <div class="text-xl opacity-0 mt-8">&nbsp;</div>
              <div class="flex-1" />
            </div>
          </div>
        </Show>
      </Transition>
    </>
  );
}
