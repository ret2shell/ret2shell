import NotImplemented from "@blocks/not-implemented";
import { Title } from "@storage/header";
import { t } from "@storage/theme";

export default function () {
  return (
    <>
      <Title page={t("admin.sync.title")} route="/admin/sync" />
      <div class="flex-1 flex items-center justify-center">
        <NotImplemented />
      </div>
    </>
  );
}
