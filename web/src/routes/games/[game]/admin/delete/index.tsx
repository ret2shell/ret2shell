import { handleHttpError } from "@api";
import { deleteGame } from "@api/game";
import { useNavigate } from "@solidjs/router";
import { gameStore } from "@storage/game";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import Input from "@widgets/input";
import { createSignal } from "solid-js";

export default function () {
  const [name, setName] = createSignal("");
  const navigate = useNavigate();
  const canDelete = () => name() === gameStore.current?.name;
  const [loading, setLoading] = createSignal(false);
  async function handleDeleteGame() {
    if (!gameStore.current) return;
    setLoading(true);
    try {
      await deleteGame(gameStore.current.id);
      addToast({
        level: "success",
        description: t("form.deleteSuccess")!,
        duration: 5000,
      });
      navigate("/games", { replace: true });
    } catch (err) {
      handleHttpError(err as Error, t("form.deleteFailed")!);
    }
    setLoading(false);
  }
  return (
    <>
      <Title page={t("game.admin.delete.title")} route={`/games/${gameStore.current?.id}/admin/edit`} />
      <div class="flex-1 flex flex-row p-4 lg:p-6 justify-center">
        <div class="flex-1 flex flex-col max-w-5xl space-y-2">
          <div class="pt-4 md:p-12 md:pb-4 flex flex-row md:flex-col items-center justify-center">
            <span class="icon-[fluent--warning-24-filled] text-error w-6 h-6 md:w-24 md:h-24" />
            <h1 class="text-center text-lg font-bold text-error ml-4 md:ml-0 md:mt-4">
              {t("game.admin.delete.title")}
            </h1>
          </div>
          <Divider class="w-full" />
          <article class="article w-full max-w-5xl self-center mt-4">
            <p>
              <strong>{t("game.admin.delete.tips")}</strong>
            </p>
            <p>
              <strong>{t("game.admin.delete.tips1")}</strong>
            </p>
            <p class="text-error">{t("game.admin.delete.tips2", { name: gameStore.current?.name || "" })}</p>
          </article>
          <Divider class="w-full" />
          <Input
            icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
            extraBtn={
              <Button
                class="rounded-l-none text-error"
                disabled={!canDelete() || loading()}
                onClick={handleDeleteGame}
                loading={loading()}
              >
                <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
                <span class="hidden md:inline">{t("form.delete")}</span>
              </Button>
            }
            class="flex-1 ml-2"
            onInput={(v) => {
              setName(v.target.value);
            }}
          />
          <Divider class="w-full" />
        </div>
      </div>
    </>
  );
}
