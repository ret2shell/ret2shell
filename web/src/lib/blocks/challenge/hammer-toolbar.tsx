import { api_root, handleHttpError, toastError, toastSuccess } from "@api";
import { uploadMedia } from "@api/media";
import MojiPicker from "@lib/moji/picker";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Popover from "@widgets/popover";
import { createSignal } from "solid-js";

/**
 * Shared chat toolbar actions: an image upload button (system file picker,
 * uploads the selection and appends a markdown image link) and a moji picker
 * button that inserts `:code:` shortcodes. Both append to the editor value
 * through `onInsert`.
 */
export default function ChatToolbarActions(props: { onInsert: (text: string) => void }) {
  const [uploading, setUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;
  let emojiTrigger: HTMLButtonElement | undefined;

  async function onFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // allow re-selecting the same file later
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toastError(t("challenge.hammer.toolbar.notImage"));
      return;
    }
    setUploading(true);
    try {
      const media = await uploadMedia(file, true);
      props.onInsert(`\n![${file.name}](${api_root}/media?hash=${media.hash})\n`);
      toastSuccess(t("challenge.hammer.toolbar.uploaded"));
    } catch (err) {
      handleHttpError(err, t("challenge.hammer.toolbar.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        class="hidden"
        data-testid="moji-file-input"
        onChange={onFileChosen}
      />
      <Button
        square
        size="sm"
        ghost
        disabled={uploading()}
        loading={uploading()}
        title={t("challenge.hammer.toolbar.uploadImage")}
        onClick={() => fileInput?.click()}
      >
        <span class="shrink-0 icon-[fluent--image-20-regular] w-5 h-5" />
      </Button>
      {/* uncontrolled popover: picking an item closes it through the
          CloseTrigger inside the picker grid */}
      <Popover
        positioning={{ placement: "top" }}
        ghost
        square
        size="sm"
        title={t("challenge.hammer.toolbar.insertMoji")}
        btnContent={<span class="shrink-0 icon-[fluent--emoji-20-regular] w-5 h-5" />}
        popContentClass="card z-50 p-3"
        ref={emojiTrigger}
        onOpenChange={(detail) => {
          // the trigger keeps focus after close, leaving the ghost button
          // highlighted — clear it so the toolbar settles back to flat
          if (!detail.open) emojiTrigger?.blur();
        }}
      >
        <MojiPicker onPick={(code) => props.onInsert(`:${code}:`)} />
      </Popover>
    </>
  );
}
