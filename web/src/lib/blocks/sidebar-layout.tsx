import { createBreakpoints } from "@solid-primitives/media";
import { type JSX, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import "./sidebar-layout.scss";

export type SidebarLayoutProps = {
    leftBar?: JSX.Element;
    showLeftBar?: boolean;
    children?: JSX.Element;
    rightBar?: JSX.Element;
    showRightBar?: boolean;
};

export default function SidebarLayout(props: SidebarLayoutProps) {
    const breakpoints = {
        xl: "1440px",
        lg: "1024px",
    };
    const matches = createBreakpoints(breakpoints);
    return (
        <div class="flex-1 flex flex-row">
            <Show when={props.leftBar && matches.lg}>
                <div class="sticky flex-shrink-0 w-1/5 top-16 left-0 h-[calc(100vh_-_4rem)] min-w-[24rem] max-w-[32rem] backdrop-blur border-r border-r-layer-content/10 print:hidden">
                    {props.leftBar}
                </div>
            </Show>
            {props.children}
            <Show when={props.rightBar && ((!props.leftBar && matches.lg) || matches.xl)}>
                <div class="sticky w-1/5 flex-shrink-0 top-16 right-0 h-[calc(100vh_-_4rem)] min-w-[24rem] max-w-[32rem] backdrop-blur border-l border-l-layer-content/10 print:hidden">
                    {props.rightBar}
                </div>
            </Show>
            <Transition name="slide-fade-left">
                <Show when={props.leftBar && !matches.lg && props.showLeftBar}>
                    <div class="fixed top-16 left-0 w-full max-w-[24rem] h-[calc(100vh_-_4rem)] overflow-hidden backdrop-blur bg-layer/60 border-r border-r-layer-content/10 print:hidden">
                        <div class="w-full h-full bg-layer-content/5 overflow-hidden">{props.leftBar}</div>
                    </div>
                </Show>
            </Transition>
            <Transition name="slide-fade-right">
                <Show when={props.rightBar && !((!props.leftBar && matches.lg) || matches.xl) && props.showRightBar}>
                    <div class="fixed top-16 right-0 w-full max-w-[24rem] h-[calc(100vh_-_4rem)] overflow-hidden backdrop-blur bg-layer/60 border-l border-l-layer-content/10 print:hidden">
                        <div class="w-full h-full bg-layer-content/5 overflow-hidden">{props.rightBar}</div>
                    </div>
                </Show>
            </Transition>
        </div>
    );
}
