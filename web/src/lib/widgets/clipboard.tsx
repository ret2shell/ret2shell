import { Clipboard, type ClipboardRootProps } from "@ark-ui/solid";
import { t } from "../storage/theme";

export default function (props: ClipboardRootProps) {
    return (
        <Clipboard.Root {...props}>
            <Clipboard.Control class="w-full flex flex-row space-x-2">
                <Clipboard.Input class="input flex-1" />
                <Clipboard.Trigger
                    class="btn btn-md flex items-center justify-center btn-square"
                    title={t("form.copy")}
                >
                    <Clipboard.Indicator
                        class="flex items-center justify-center"
                        copied={<span class="icon-[fluent--checkmark-20-regular] w-5 h-5 text-success" />}
                    >
                        <span class="icon-[fluent--copy-20-regular] w-5 h-5" />
                    </Clipboard.Indicator>
                </Clipboard.Trigger>
            </Clipboard.Control>
        </Clipboard.Root>
    );
}
