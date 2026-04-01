import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Popover from "@widgets/popover";
import { Show } from "solid-js";

export default function FormDraftReset(props: {
  when: boolean;
  loading?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  onConfirm: () => void;
}) {
  return (
    <Show when={props.when}>
      <Popover
        type="button"
        level="warning"
        size={props.size}
        square
        disabled={props.disabled}
        title={t("general.actions.discardDraft.title")}
        btnContent={<span class="shrink-0 icon-[fluent--arrow-reset-20-regular] w-5 h-5" />}
      >
        <Card contentClass="p-4 flex flex-col space-y-2 items-stretch max-w-lg">
          <Card level="warning" contentClass="p-2 flex space-x-2 items-center">
            <span class="icon-[fluent--warning-20-filled] w-5 h-5 text-warning shrink-0" />
            <p class="font-bold">{t("general.actions.discardDraft.message")}</p>
          </Card>
          <span>{t("general.actions.discardDraft.description")}</span>
          <Button
            size="sm"
            level="warning"
            class="self-end"
            disabled={props.disabled || props.loading}
            loading={props.loading}
            onClick={props.onConfirm}
          >
            {t("general.actions.discardDraft.confirm")}
          </Button>
        </Card>
      </Popover>
    </Show>
  );
}
