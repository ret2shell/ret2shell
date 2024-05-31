import { Splitter, type SplitterRootProps } from "@ark-ui/solid";
import type { JSX } from "solid-js";

export default function (props: SplitterRootProps & { startPanel: JSX.Element; endPanel: JSX.Element }) {
    return (
        <Splitter.Root {...props}>
            <Splitter.Panel class="splitter-panel" id={"a"}>
                {props.startPanel}
            </Splitter.Panel>
            {/* splitter-gutter-vertical splitter-gutter-horizontal */}
            <Splitter.ResizeTrigger id={"a:b"} class={`splitter-gutter splitter-gutter-${props.orientation}`} />
            <Splitter.Panel class="splitter-panel" id={"b"}>
                {props.endPanel}
            </Splitter.Panel>
        </Splitter.Root>
    );
}
