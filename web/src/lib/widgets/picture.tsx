import { type ComponentProps, Show, createEffect, createSignal, splitProps, untrack } from "solid-js";
import { Transition } from "solid-transition-group";
import Spin from "../assets/animates/spin";

export type ImageProps = {
    src?: string;
    alt?: string;
    fallback?: string;
    width?: number;
    height?: number;
};

export default function (props: ImageProps & ComponentProps<"div">) {
    const [imageProps, rest] = splitProps(props, ["src", "alt", "fallback", "width", "height"]);
    const [loading, setLoading] = createSignal(true);
    let cachedSrc = "" as string | undefined;
    createEffect(() => {
        if (imageProps.src && cachedSrc !== imageProps.src) {
            untrack(() => {
                setLoading(true);
                cachedSrc = imageProps.src;
            });
        }
    });
    return (
        <div {...rest} class={`overflow-hidden relative ${rest.class}`}>
            <img
                class="w-full h-full object-cover"
                width={imageProps.width}
                height={imageProps.height}
                src={imageProps.src}
                alt={imageProps.alt}
                onLoad={() => {
                    setTimeout(() => {
                        setLoading(false);
                    }, 500);
                }}
                onLoadStart={() => setLoading(true)}
            />
            <Transition
                onEnter={(el, done) => {
                    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], {
                        duration: 300,
                    });
                    void a.finished.then(done);
                }}
                onExit={(el, done) => {
                    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], {
                        duration: 300,
                    });
                    void a.finished.then(done);
                }}
            >
                <Show when={loading()}>
                    <div class="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-layer/80 backdrop-blur-xl">
                        <Spin width={24} height={24} />
                    </div>
                </Show>
            </Transition>
        </div>
    );
}
