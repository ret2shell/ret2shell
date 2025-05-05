import { handleHttpError } from "@api";
import { bindWithOAuth, getOAuthProviders, loginWithOAuth } from "@api/account";
import LogoAnimate from "@assets/animates/logo-animate";
// import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
import logo from "@assets/logo-gray.svg";
import { mediaPath } from "@lib/utils/media";
import type { OAuthProvider } from "@models/oauth-provider";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { createSignal, onMount } from "solid-js";

export default function () {
  const [animate, setAnimate] = createSignal(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, _] = useSearchParams();
  const [oauthServices, setOAuthServices] = createSignal([] as OAuthProvider[]);
  onMount(async () => {
    try {
      setOAuthServices(await getOAuthProviders());
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.errors.fetchProvider.title")!);
    }
    setTimeout(() => {
      setAnimate(true);
    }, 100);
    setTimeout(() => {
      handleAction();
    }, 2000);
  });

  const brand = () => {
    const service = searchParams.service;
    const avatar = oauthServices().find((s) => s.provider === service)?.avatar;
    if (avatar) return mediaPath(avatar);
    return logo;
  };

  async function handleAction() {
    if (accountStore.token) {
      handleBindWithOAuth();
    } else {
      handleLoginWithOAuth();
    }
  }

  async function handleLoginWithOAuth() {
    try {
      const resp = await loginWithOAuth(location.search);
      if (resp.token && resp.data) {
        navigate(`/account/register?token=${resp.token}&auth_key=${resp.data.auth_key as string} `, {
          replace: true,
        });
        return;
      }
      navigate("/", { replace: true });
      addToast({
        level: "success",
        description: t("account.login.status.success.message")!,
        duration: 5000,
        // img: xdsecMascotHappy,
      });
    } catch (err) {
      handleHttpError(err as Error, t("account.login.errors.login.title")!);
      setTimeout(() => {
        navigate("/account/login", { replace: true });
      });
    }
  }

  async function handleBindWithOAuth() {
    try {
      await bindWithOAuth(location.search);
      navigate("/account/settings/oauth", { replace: true });
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.errors.bind.title")!);
      setTimeout(() => {
        navigate("/account/settings/oauth", { replace: true });
      });
    }
  }

  return (
    <>
      <Title page={t("account.oauth.title")} route="/account/oauth" />
      <div class="flex-1 w-full flex flex-col space-y-8 items-center justify-center">
        <div class="flex flex-row space-x-8 items-center">
          <LogoAnimate
            width={128}
            height={128}
            class={clsx("transition-all duration-700", !animate() && "translate-x-16 opacity-0")}
          />
          <span class={clsx("text-2xl font-bold transition-all duration-700", !animate() && "opacity-0")}>+</span>
          <img
            src={brand()}
            alt="Brand"
            class={clsx("w-32 h-32 transition-all duration-700", !animate() && "-translate-x-16 opacity-0")}
          />
        </div>
        <LoadingTips />
      </div>
    </>
  );
}
