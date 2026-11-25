import type { JSX } from "@solidjs/web";

export default function (props: { children?: JSX.Element }) {
  return <>{props.children}</>;
}
