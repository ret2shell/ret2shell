import { type ComponentProps, Show, createEffect, createSignal, onMount, splitProps } from "solid-js";
import Card from "./card";
import ace from "ace-builds";
import "ace-builds/esm-resolver";
import { type FormStore, setValue } from "@modular-forms/solid";
import { t, themeStore } from "@storage/theme";
import { uploadMedia } from "@api/media";
import { mediaPath } from "@lib/utils/media";
import Spin from "@assets/animates/spin";
import { handleHttpError } from "@api";

export type EditorProps = {
  value?: string;
  lang?: string;
  onValueChanged?: (value: string) => void;
  onBlur?: () => void;
  readonly?: boolean;
  placeholder?: string;
  name?: string;
  title?: string;
  lineNumbers?: boolean;

  // biome-ignore lint/suspicious/noExplicitAny: the options are not ensured
  form?: FormStore<any, undefined>;
  error?: string;
  onFocusIn?: () => void;
};

export function EditorBare(props: EditorProps & ComponentProps<"div">) {
  const [editorProps, native] = splitProps(props, [
    "value",
    "onValueChanged",
    "lang",
    "readonly",
    "placeholder",
    "onBlur",
    "name",
    "title",
    "form",
    "error",
    "onFocusIn",
  ]);
  const [imageFile, setImageFile] = createSignal<File | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  async function handleUploadImage() {
    if (imageFile()) {
      setUploading(true);
      try {
        const resp = await uploadMedia(imageFile()!, false);
        editor?.insert(`![${imageFile()!.name}](${mediaPath(resp.hash)})`);
      } catch (err) {
        handleHttpError(err as Error, t("form.uploadFailed")!);
      }
      setUploading(false);
    }
  }
  let editorElement: HTMLPreElement;
  let editor: ace.Ace.Editor | null = null;
  function initEditor() {
    editor = ace.edit(editorElement, {
      mode: `ace/mode/${editorProps.lang || "text"}`,
      theme: `ace/theme/${themeStore.colorScheme === "light" ? "kuroir" : "github_dark"}`,
      readOnly: editorProps.readonly,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showGutter: props.lineNumbers ?? false,
      showLineNumbers: props.lineNumbers ?? false,
      tabSize: 2,
      useSoftTabs: true,
      wrap: true,
      value: editorProps.value,
      fontSize: 16,
      fontFamily: "JetBrains Mono",
      cursorStyle: "smooth",
      animatedScroll: true,
      fadeFoldWidgets: true,
      hScrollBarAlwaysVisible: false,
      selectionStyle: "text",
      placeholder: editorProps.placeholder,
      useWorker: false,
    });
    editor.container.style.lineHeight = "1.6";

    editor.on("change", () => {
      const content = editor?.getValue();
      editorProps.onValueChanged?.(content || "");
      if (editorProps.form && editorProps.name) setValue(editorProps.form, editorProps.name, content);
    });

    editor.on("blur", () => {
      editorProps.onBlur?.();
    });

    editor.on("focus", () => {
      editorProps.onFocusIn?.();
    });
    editor.container.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            setImageFile(file);
            handleUploadImage();
          }
        }
      }
    });

    editor.container.addEventListener("dragenter", () => {
      setDragging(true);
    });
    editor.container.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    editor.container.addEventListener("dragleave", () => {
      setDragging(false);
    });
    editor.container.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) {
        setImageFile(file);
        handleUploadImage();
      }
    });
  }
  createEffect(() => {
    if (editorProps.value !== editor?.getValue()) {
      editor?.setValue(editorProps.value || "");
    }
  });

  onMount(() => {
    setTimeout(() => {
      initEditor();
    });
  });

  return (
    <div {...native} class={`relative ${native.class}`.trim()}>
      <div class="absolute left-0 top-0 bottom-0 right-0 p-2">
        <pre class="w-full min-h-full relative bg-transparent" ref={editorElement!} />
      </div>
      <Show when={editorProps.error}>
        <Card class="absolute bottom-2 left-2 right-2" level="error" contentClass="z-50 px-4 p-2">
          <p>{editorProps.error}</p>
        </Card>
      </Show>
      <Show when={uploading()}>
        <Card class="absolute bottom-2 left-2 right-2" level="info" contentClass="z-50 px-4 p-2 flex items-center">
          <Spin width={20} height={20} />
          <p>{t("form.uploading")}</p>
        </Card>
      </Show>
      <Show when={dragging()}>
        <Card class="absolute bottom-2 left-2 right-2 top-2" contentClass="z-50 flex items-center justify-center">
          <span class="icon-[fluent--image-20-regular] w-12 h-12" />
        </Card>
      </Show>
    </div>
  );
}

export default function Editor(props: EditorProps & ComponentProps<"div">) {
  const [editorProps, nativeProps] = splitProps(props, [
    "value",
    "onValueChanged",
    "lang",
    "readonly",
    "placeholder",
    "onBlur",
    "name",
    "title",
    "form",
    "error",
    "onFocusIn",
    "lineNumbers",
  ]);
  const [focused, setFocused] = createSignal(false);
  const cardClasses = () =>
    `flex-1 card-field ${editorProps.error ? "card-error" : ""} ${focused() ? "card-focused" : ""}`.trim();
  return (
    <div {...nativeProps} class={`flex flex-col space-y-1 ${nativeProps.class}`.trim()}>
      <Show when={editorProps.title}>
        <label class="label" for={editorProps.name}>
          {editorProps.title}
        </label>
      </Show>
      <Card class={cardClasses()} contentClass="p-2">
        <EditorBare
          {...editorProps}
          class="w-full h-full"
          onBlur={() => {
            setFocused(false);
            editorProps.onBlur?.();
          }}
          onFocusIn={() => {
            setFocused(true);
            editorProps.onFocusIn?.();
          }}
          onFocusOut={() => {
            setFocused(false);
          }}
        />
      </Card>
    </div>
  );
}
