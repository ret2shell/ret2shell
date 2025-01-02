import { Title } from "@storage/header";
import KeyGames from "./_blocks/key-games";
import OtherGames from "./_blocks/other-games";
import { t } from "@storage/theme";

export default function () {
  return (
    <>
      <Title page={t("game.title")} route="/games" />
      <div class="flex-1 relative">
        <div class="lg:absolute lg:h-full lg:w-full overflow-scroll lg:snap-mandatory lg:snap-y">
          <KeyGames />
          <OtherGames />
        </div>
      </div>
    </>
  );
}
