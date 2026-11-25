import type { JSX } from "@solidjs/web";
import Cover from "./_blocks/cover";

export default function (props: { children?: JSX.Element }) {
  return (
    <>
      {props.children}
      <Cover />
    </>
  );
}
