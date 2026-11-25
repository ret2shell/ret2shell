import { useParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Card from "@widgets/card";

export default function Choose() {
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "0", 10) || 0;

  return (
    <>
      <Title page={t("team.choose.title")} route={`/games/${gameId()}/teams/choose`} />
      <div class="flex-1 flex flex-col items-center justify-center p-3 md:p-6 space-y-4">
        <Card class="relative w-full max-w-xl group" contentClass="p-6 flex flex-row items-center space-x-4">
          <span class="icon-[fluent-emoji-flat--loudspeaker] w-10 h-10 shrink-0" />
          <div class="flex flex-col justify-center space-y-2">
            <h3 class="font-bold">{t("team.create.title")}</h3>
            <p class="opacity-60">{t("team.create.tips")}</p>
          </div>
          <span class="icon-[fluent--chevron-double-right-20-regular] w-0 group-hover:w-10 h-10 shrink-0 transition-all" />
          <a href={`/games/${gameId()}/teams/create`} class="absolute top-0 left-0 w-full h-full">
            <span class="sr-only">{t("team.create.title")}</span>
          </a>
        </Card>
        <Card class="relative w-full max-w-xl group" contentClass="p-6 flex flex-row items-center space-x-4">
          <span class="icon-[fluent-emoji-flat--clinking-beer-mugs] w-10 h-10 shrink-0" />
          <div class="flex flex-col justify-center space-y-2">
            <h3 class="font-bold">{t("team.join.title")}</h3>
            <p class="opacity-60">{t("team.join.tips")}</p>
          </div>
          <span class="icon-[fluent--chevron-double-right-20-regular] w-0 group-hover:w-10 h-10 shrink-0 transition-all" />
          <a href={`/games/${gameId()}/teams/join`} class="absolute top-0 left-0 w-full h-full">
            <span class="sr-only">{t("team.join.title")}</span>
          </a>
        </Card>
      </div>
    </>
  );
}
