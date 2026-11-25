import { useGame } from "@api/game";
import { HostType } from "@models/game";
import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Title } from "@storage/header";
import { HTTPError } from "ky";
import { createTrackedEffect, onCleanup } from "solid-js";
import { setGameCoverStore } from "../_blocks/cover";
import TeamCover from "./_blocks/team-cover";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "UNKN0WN", 10);
  const game = useGame({
    id: () => gameId(),
    enabled: () => !!gameId(),
    onError: (err) => {
      if (err instanceof HTTPError) {
        navigate(`/sigtrap/${err.response.status}`, { replace: true });
      } else {
        navigate("/sigtrap/unknown", { replace: true });
      }
      return false;
    },
  });

  createTrackedEffect(() => {
    if (game.data && game.data.host_type !== HostType.Game) {
      navigate(`/training/${game.data.id}${window.location.search}`, { replace: true });
    }
  });

  onCleanup(() => {
    setGameCoverStore((s) => {
      s.goto = null;
    });
  });

  return (
    <>
      <Title domain={game.data?.name || "CTF"} route={`/games/${game.data?.id}`} />
      {props.children}
      <TeamCover />
    </>
  );
}
