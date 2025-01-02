import { bindWithOAuth } from "@api/account";
import LogoAnimate from "@assets/animates/logo-animate";
import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import LoadingTips from "@widgets/loading-tips";
import { createSignal, onMount } from "solid-js";
import logo from "@assets/logo-gray.svg";
import { getLogo } from "@assets/brands";
import { handleHttpError } from "@api";

export default function () {
  const [animate, setAnimate] = createSignal(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, _] = useSearchParams();
  onMount(() => {
    setTimeout(() => {
      setAnimate(true);
    }, 100);
    setTimeout(() => {
      handleBindWithOAuth();
    }, 2000);
  });
  const brand = () => {
    const service = searchParams.service;
    if (service) return getLogo(service as string);
    return logo;
  };

  async function handleBindWithOAuth() {
    try {
      await bindWithOAuth(location.search);
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.failedToBind")!);
    }
    setTimeout(() => {
      navigate("/account/settings/oauth", { replace: true });
    });
  }

  return (
    <>
      <Title page={t("account.bind.title")} route="/account/bind" />
      <div class="flex-1 w-full flex flex-col space-y-8 items-center justify-center">
        <div class="flex flex-row space-x-8 items-center">
          <LogoAnimate
            width={128}
            height={128}
            class={`transition-all duration-700 ${animate() ? "" : "translate-x-10 opacity-0"}`}
          />
          <span class={`transition-all duration-700 ${animate() ? "opacity-60" : "translate-x-6 opacity-0"}`}>-*-</span>

          <img
            src={xdsecMascotHappy}
            alt="Broken"
            class={`w-24 h-24 animate-bounce transition-all duration-700 ${animate() ? "" : "translate-y-6 opacity-0"}`}
          />
          <span class={`transition-all duration-700 ${animate() ? "opacity-60" : "-translate-x-6 opacity-0"}`}>
            -*-
          </span>

          <img
            src={brand()}
            alt="Brand"
            class={`w-32 h-32 transition-all duration-700 ${animate() ? "" : "-translate-x-10 opacity-0"}`}
          />
        </div>
        <LoadingTips />
      </div>
    </>
  );
}
