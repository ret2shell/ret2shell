import { setGameStore } from "@storage/game";
import { type JSX, onCleanup } from "solid-js";
import Cover from "./_blocks/cover";

export default function (props: { children?: JSX.Element }) {
  onCleanup(() => {
    setGameStore({ current: null, games: [], preload: null });
  });
  return (
    <>
      {props.children}
      <Cover />
    </>
  );
}
