import { Avatar } from "@ark-ui/solid";
import Spin from "@assets/animates/spin";
import type { JSX } from "@solidjs/web";
import clsx from "clsx";
import { createSignal, omit, Show } from "solid-js";

export type AvatarProps = {
  fallback?: string;
  class?: string;
  src?: string;
  alt?: string;
  children?: JSX.Element;
  loading?: boolean;
};

export default function (props: AvatarProps) {
  const root = omit(props, "fallback", "loading", "children");
  const [imageLoading, setImageLoading] = createSignal(true);
  return (
    <Avatar.Root class={clsx("avatar", root.class)}>
      <Avatar.Fallback class="avatar-fallback">{props.fallback?.[0]?.toUpperCase() || "#"}</Avatar.Fallback>
      <Avatar.Image
        src={root.src}
        alt={root.alt}
        class="avatar-img"
        onLoad={() => {
          // console.log("loaded");
          setImageLoading(false);
        }}
        onError={() => {
          // console.log("error");
          setImageLoading(false);
        }}
      />
      {props.children}
      <Show when={props.loading || (root.src && imageLoading())}>
        <div class="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <Spin width={20} height={20} />
        </div>
      </Show>
    </Avatar.Root>
  );
}
