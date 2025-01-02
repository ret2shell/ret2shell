import { Title, tmpl } from "@storage/header";
import { E, t } from "@storage/theme";

export default function () {
  return (
    <>
      <Title title={tmpl`${t("docs.title")} - ${E("platform.name")}`} />
      <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
        <span class="icon-[fluent-emoji-flat--hammer-and-wrench] w-24 h-24" />
        <span>{t("docs.title")}</span>
      </div>
    </>
  );
}
