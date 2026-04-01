import { useGame, useUpdateGameMutation } from "@api/game";
import GameEdit, { type GameForm } from "@blocks/game/form";
import { useParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { DateTime } from "luxon";
import { createMemo } from "solid-js";

export default function () {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  const updateMutation = useUpdateGameMutation();

  async function onSubmit(result: GameForm) {
    if (!game.data) return;
    await updateMutation.mutateAsync({
      id: game.data.id,
      game: {
        ...game.data,
        ...result,
        start_at: DateTime.fromSeconds(result.start_at!),
        end_at: DateTime.fromSeconds(result.end_at!),
        archive_at: DateTime.fromSeconds(result.archive_at!),
        register_at: DateTime.fromSeconds(result.register_at!),
        award_rates: [
          result.first_blood_award ?? result.award_rate ?? 0,
          result.second_blood_award ?? ((result.award_rate ?? 0) * 2) / 3,
          result.third_blood_award ?? (result.award_rate ?? 0) / 3,
        ],
        hammer_policy: {
          enabled: !!result.enable_hammer,
          outer_label: result.outer_hammer_label || null,
          outer_url: result.outer_hammer_url || null,
        },
      },
    });
    await game.refetch();
  }
  return (
    <>
      <Title page={t("game.form.title")} route={`/games/${gameId()}/admin/edit`} />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <GameEdit onDone={onSubmit} gameId={gameId()} />
      </div>
    </>
  );
}
