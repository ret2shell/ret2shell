import { Title } from "@storage/header";
import { t } from "@storage/theme";

export default function () {
  return (
    <>
      <Title page={t("wiki.title")} route="/wiki" />
      <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
        <span class="icon-[fluent--book-20-regular] w-24 h-24" />
        <span>{t("wiki.placeholder")}</span>
      </div>
    </>
  );
}
