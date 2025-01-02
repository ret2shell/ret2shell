import { handleHttpError } from "@api";
import { bindWithOAuth } from "@api/account";
import LogoAnimate from "@assets/animates/logo-animate";
import { getLogo } from "@assets/brands";
import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
import logo from "@assets/logo-gray.svg";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { Title, tmpl } from "@storage/header";
import { E, t } from "@storage/theme";
import LoadingTips from "@widgets/loading-tips";
import { createSignal, onMount } from "solid-js";

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
    <div class="flex-1 w-full flex flex-col space-y-8 items-center justify-center">
      <Title title={tmpl`${t("account.bind.title")} - ${E("platform.name")}`} />
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
        <span class={`transition-all duration-700 ${animate() ? "opacity-60" : "-translate-x-6 opacity-0"}`}>-*-</span>

        <img
          src={brand()}
          alt="Brand"
          class={`w-32 h-32 transition-all duration-700 ${animate() ? "" : "-translate-x-10 opacity-0"}`}
        />
      </div>
      <LoadingTips />
    </div>
  );
}
