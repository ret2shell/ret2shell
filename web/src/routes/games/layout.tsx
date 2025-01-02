import { setGameStore } from "@storage/game";
import { Title, tmpl } from "@storage/header";
import { E, t } from "@storage/theme";
import { type JSX, onCleanup } from "solid-js";
import Cover from "./_blocks/cover";

export default function (props: { children?: JSX.Element }) {
  onCleanup(() => {
    setGameStore({ current: null, games: [], preload: null });
  });
  return (
    <>
      <Title title={tmpl`${t("game.title")} - ${E("platform.name")}`} />
      {props.children}
      <Cover />
    </>
  );
}
