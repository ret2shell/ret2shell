import { useBindWithOAuthMutation, useLoginWithOAuthMutation, useOAuthProviders } from "@api/account";
import LogoAnimate from "@assets/animates/logo-animate";
// import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
import logo from "@assets/logo-gray.svg";
import { mediaPath } from "@lib/utils/media";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import { createSignal, createTrackedEffect } from "solid-js";

export default function () {
  const [animate, setAnimate] = createSignal(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, _] = useSearchParams();
  const oauthProviders = useOAuthProviders();

  createTrackedEffect(() => {
    if (!oauthProviders.isLoading && oauthProviders.data) {
      setTimeout(() => {
        setAnimate(true);
      }, 100);
      setTimeout(() => {
        handleAction();
      }, 2000);
    }
  });

  const brand = () => {
    const service = searchParams.service;
    const avatar = oauthProviders.data?.find((s) => s.provider === service)?.avatar;
    if (avatar) return mediaPath(avatar);
    return logo;
  };

  const loginWithOAuthMutation = useLoginWithOAuthMutation({
    onSuccess: (resp) => {
      if (resp.token && resp.data) {
        navigate(`/account/register?token=${resp.token}&auth_key=${resp.data.auth_key as string} `, {
          replace: true,
        });
        return;
      }
      navigate("/", { replace: true });
    },
    onError: () => {
      setTimeout(() => {
        navigate("/account/login", { replace: true });
      });
    },
  });

  const bindWithOAuthMutation = useBindWithOAuthMutation({
    onSuccess: () => {
      navigate("/account/settings/oauth", { replace: true });
    },
    onError: () => {
      setTimeout(() => {
        navigate("/account/settings/oauth", { replace: true });
      });
    },
  });

  async function handleAction() {
    if (accountStore.token) {
      bindWithOAuthMutation.mutate(location.search);
    } else {
      loginWithOAuthMutation.mutate(location.search);
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
