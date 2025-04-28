import { handleHttpError } from "@api";
import { updateGame } from "@api/game";
import GameEdit, { type GameForm } from "@blocks/game/form";
import { gameStore, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { DateTime } from "luxon";
import { createSignal } from "solid-js";

export default function () {
  const [loading, setLoading] = createSignal(false);
  async function onSubmit(result: GameForm) {
    setLoading(true);
    try {
      const game = await updateGame(gameStore.current!.id, {
        ...gameStore.current!,
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
      });
      setGameStore({ current: game });
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setLoading(false);
  }
  return (
    <>
      <Title page={t("game.form.title")} route={`/games/${gameStore.current?.id}/admin/edit`} />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <GameEdit onDone={onSubmit} editSource={gameStore.current || undefined} loading={loading()} inGame />
      </div>
    </>
  );
}
