import rxSticker from "@assets/imgs/rx.webp";
import { t } from "@storage/theme";

export default function NotImplemented() {
  return (
    <div class="flex flex-col space-y-8 items-center justify-center">
      <img class="rounded-xl" src={rxSticker} width={256} height={256} alt="ΦωΦ" />
      <h1 class="font-bold text-3xl space-x-4">
        <span class="opacity-60">{t("platform.errors.notImplemented.hello")}</span>
        <span class="text-primary">|</span>
        <span>{t("platform.errors.notImplemented.title")}</span>
      </h1>
      <p class="opacity-60">{t("platform.errors.notImplemented.message")}</p>
    </div>
  );
}
