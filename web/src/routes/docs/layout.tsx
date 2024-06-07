import SidebarLayout from "@/lib/blocks/sidebar-layout";
import Button from "@/lib/widgets/button";
import { createBreakpoints } from "@solid-primitives/media";
import { type JSX, Show, createSignal } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
    const breakpoints = {
        lg: "1024px",
    };
    const matches = createBreakpoints(breakpoints);
    const [showSidebar, setShowSidebar] = createSignal(false);
    return (
        <>
            <SidebarLayout leftBar={<Sidebar />} showLeftBar={showSidebar()}>
                {props.children}
            </SidebarLayout>
            <Transition name="slide-fade-right">
                <Show when={!matches.lg}>
                    <Button
                        class="fixed bottom-3 right-3"
                        square
                        onClick={() => setShowSidebar(!showSidebar())}
                        type="button"
                    >
                        {/* icon-[fluent--book-20-regular] icon-[fluent--dismiss-20-regular] rotate-90 rotate-0 */}
                        <span
                            class={`transition-transform rotate-${showSidebar() ? "90" : "0"} icon-[fluent--${
                                showSidebar() ? "dismiss" : "book"
                            }-20-regular] w-5 h-5`}
                        />
                    </Button>
                </Show>
            </Transition>
        </>
    );
}
