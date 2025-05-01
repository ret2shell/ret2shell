import NotImplemented from "@blocks/not-implemented";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";

export default function Capture() {
  return (
    <>
      <Title page={t("captures.title")} route={`/games/${gameStore.current?.id}/admin/captures`} />
      <div class="flex-1 flex items-center justify-center">
        <NotImplemented />
      </div>
    </>
  );
}
