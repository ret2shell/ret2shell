import NotImplemented from "@blocks/not-implemented";
import { Title, tmpl } from "@storage/header";
import { E, t } from "@storage/theme";

export default function () {
  return (
    <>
      <Title title={tmpl`${t("admin.sync.title")} - ${E("platform.name")}`} />
      <div class="flex-1 flex items-center justify-center">
        <NotImplemented />
      </div>
    </>
  );
}
