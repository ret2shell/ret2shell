import type { ComponentProps } from "@solidjs/web";
import ace from "ace-builds";
import { createSignal, createTrackedEffect, omit, onSettled, Show } from "solid-js";
import Card from "./card";
import "ace-builds/esm-resolver";
import { handleHttpError } from "@api";
import { uploadMedia } from "@api/media";
import Spin from "@assets/animates/spin";
import { mediaPath } from "@lib/utils/media";
import { pick } from "@lib/utils/pick";
import { type FormStore, setValue } from "@modular-forms/solid";
import { t, themeStore } from "@storage/theme";
import clsx from "clsx";

let runeModePromise: Promise<unknown> | null = null;

export type DiagnosticMarker = {
  kind: "error" | "warning" | "info";
  message: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
};

export type EditorProps = {
  value?: string;
  lang?: string;
  onValueChanged?: (value: string) => void;
  commands?: {
    name: string;
    bindKey: string | { mac?: string | undefined; win?: string | undefined };
    exec: () => void;
  }[];
  onBlur?: () => void;
  readonly?: boolean;
  placeholder?: string;
  name?: string;
  title?: string;
  lineNumbers?: boolean;
  lints?: DiagnosticMarker[];

  // biome-ignore lint/suspicious/noExplicitAny: the options are not ensured
  form?: FormStore<any, undefined>;
  error?: string;
  onFocusIn?: () => void;
};

export function EditorBare(props: EditorProps & ComponentProps<"div">) {
  const native = omit(
    props,
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
    "commands",
    "lints"
  );
  const [imageFile, setImageFile] = createSignal<File | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  let editorElement: HTMLPreElement;
  let editor: ace.Ace.Editor | null = null;
  function applyLints(lints = props.lints ?? []) {
    if (!editor) return;
    const annotations = lints.map((lint) => ({
      row: lint.start_line,
      column: lint.start_column,
      text: lint.message,
      type: lint.kind === "error" ? "error" : lint.kind === "warning" ? "warning" : "info",
    }));
    editor.getSession().setAnnotations(annotations);
    const prevMarkers = editor.session.getMarkers();
    if (prevMarkers) {
      const prevMarkersArr: number[] = Object.keys(prevMarkers).map((v) => Number.parseInt(v, 10));
      for (const item of prevMarkersArr) {
        editor.session.removeMarker(prevMarkers[item].id as number);
      }
    }
    const markers = lints.map((lint) => ({
      startRow: lint.start_line,
      startCol: lint.start_column,
      endRow: lint.end_line,
      endCol: lint.end_column,
      className:
        lint.kind === "error" ? "ace_error-marker" : lint.kind === "warning" ? "ace_warning-marker" : "ace_info-marker",
      type: "text" as "text" | "line" | "fullLine",
    }));
    for (const marker of markers) {
      editor
        .getSession()
        .addMarker(
          new ace.Range(marker.startRow, marker.startCol, marker.endRow, marker.endCol),
          marker.className,
          marker.type,
          false
        );
    }
  }
  async function handleUploadImage() {
    if (imageFile()) {
      setUploading(true);
      try {
        const resp = await uploadMedia(imageFile()!, false);
        editor?.insert(`![${imageFile()!.name}](${mediaPath(resp.hash)})`);
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail"));
      }
      setUploading(false);
    }
  }
  async function initEditor() {
    const isRune = props.lang === "rune";
    if (isRune) {
      runeModePromise ??= import("./ace/rune");
      await runeModePromise;
    }
    editor = ace.edit(editorElement!, {
      mode: isRune ? "ace/mode/rune" : `ace/mode/${props.lang || "text"}`,
      theme: `ace/theme/${themeStore.colorScheme === "light" ? "kuroir" : "github_dark"}`,
      readOnly: props.readonly,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showGutter: props.lineNumbers ?? false,
      showLineNumbers: props.lineNumbers ?? false,
      tabSize: 2,
      useSoftTabs: true,
      wrap: true,
      value: props.value,
      fontSize: 16,
      fontFamily: "Reverier Mono",
      cursorStyle: "smooth",
      animatedScroll: true,
      fadeFoldWidgets: true,
      hScrollBarAlwaysVisible: false,
      selectionStyle: "text",
      placeholder: props.placeholder,
      useWorker: false,
    });
    editor.container.style.lineHeight = "1.6";
    editor.on("change", () => {
      const content = editor?.getValue();
      props.onValueChanged?.(content || "");
      if (props.form && props.name) setValue(props.form, props.name, content);
    });

    editor.on("blur", () => {
      props.onBlur?.();
    });

    editor.on("focus", () => {
      props.onFocusIn?.();
    });

    for (const command of props.commands || []) {
      editor.commands.addCommand({
        name: command.name,
        bindKey: command.bindKey,
        exec: command.exec,
      });
    }

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
    applyLints();
  }
  createTrackedEffect(() => {
    if (props.value !== editor?.getValue()) {
      editor?.setValue(props.value || "");
    }
  });
  createTrackedEffect(() => {
    if (themeStore.colorScheme && editor) {
      editor.setTheme(`ace/theme/${themeStore.colorScheme === "light" ? "kuroir" : "github_dark"}`);
    }
  });
  createTrackedEffect(() => {
    applyLints(props.lints ?? []);
  });

  onSettled(() => {
    setTimeout(() => {
      initEditor();
    });
  });

  return (
    <div {...native} class={clsx("relative", native.class)}>
      <div class="absolute left-0 top-0 bottom-0 right-0 p-2">
        <pre class="w-full min-h-full relative bg-transparent!" ref={editorElement!} />
      </div>
      <Show when={props.error}>
        <Card class="absolute bottom-2 left-2 right-2" level="error" contentClass="z-50 px-4 p-2">
          <p>{props.error}</p>
        </Card>
      </Show>
      <Show when={uploading()}>
        <Card class="absolute bottom-2 left-2 right-2" level="info" contentClass="z-50 px-4 p-2 flex items-center">
          <Spin width={20} height={20} />
          <p>{t("general.actions.upload.status.inProcess")}</p>
        </Card>
      </Show>
      <Show when={dragging()}>
        <Card class="absolute bottom-2 left-2 right-2 top-2" contentClass="z-50 flex items-center justify-center">
          <span class="shrink-0 icon-[fluent--image-20-regular] w-12 h-12" />
        </Card>
      </Show>
    </div>
  );
}

export default function Editor(props: EditorProps & ComponentProps<"div">) {
  const editorPropsKeys = [
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
    "commands",
    "lints",
  ] as const;
  const nativeProps = omit(props, ...editorPropsKeys);
  const editorProps = pick(props, editorPropsKeys);
  const [focused, setFocused] = createSignal(false);
  return (
    <div {...nativeProps} class={clsx("flex flex-col space-y-1", nativeProps.class)}>
      <Show when={props.title}>
        <label class="label" for={props.name}>
          {props.title}
        </label>
      </Show>
      <Card
        class={clsx("flex-1 card-field", props.error && "card-error", focused() && "card-focused")}
        contentClass="p-2"
      >
        <EditorBare
          {...editorProps}
          class="w-full h-full"
          onBlur={() => {
            setFocused(false);
            props.onBlur?.();
          }}
          onFocusIn={() => {
            setFocused(true);
            props.onFocusIn?.();
          }}
          onFocusOut={() => {
            setFocused(false);
          }}
        />
      </Card>
    </div>
  );
}
