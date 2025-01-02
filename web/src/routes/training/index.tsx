import { addToast } from "@storage/toast";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { t } from "@storage/theme";
import { Show } from "solid-js";
import CreatePlayground from "./_blocks/create";
import { Title } from "@storage/header";

export default function () {
  const [searchParams, _] = useSearchParams();
  const navigate = useNavigate();
  return (
    <>
      <Title page={t("training.title")} route="/training" />
      <Show
        when={searchParams.create === "true"}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
            <span class="icon-[fluent--dumbbell-20-regular] w-24 h-24" />
            <span>{t("training.selectPlayground")}</span>
          </div>
        }
      >
        <div class="flex-1 flex flex-col">
          <CreatePlayground
            onDone={(resp) => {
              addToast({
                level: "success",
                description: t("training.createSuccess", { name: resp.name })!,
                duration: 5000,
              });
              navigate(`/training/${resp.id}`);
            }}
          />
        </div>
      </Show>
    </>
  );
}
