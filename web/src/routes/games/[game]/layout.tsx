import { getGame } from "@api/game";
import { HostType } from "@models/game";
import { useNavigate, useParams } from "@solidjs/router";
import { setChallengeStore } from "@storage/challenge";
import { gameStore, refreshSelfTeam, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { HTTPError } from "ky";
import { type JSX, onCleanup, onMount } from "solid-js";
import TeamCover from "./_blocks/team-cover";
import { refreshInstitutes } from "@storage/account";
import { handleHttpError } from "@api";
import { t } from "@storage/theme";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  onCleanup(() => {
    setGameStore({ current: null, preload: null, team: null, showTeamCover: false });
    setChallengeStore({ current: null, challenges: [], solves: [] });
  });
  const params = useParams();
  const game_id = Number.parseInt(params.game);
  onMount(async () => {
    if (game_id) {
      try {
        const resp = await getGame(game_id);
        if (resp.host_type !== HostType.Game) {
          navigate(`/training/${resp.id}`);
          return null;
        }
        setGameStore({ current: resp });
        setTimeout(() => {
          refreshSelfTeam();
        });
      } catch (err) {
        if (err instanceof HTTPError) {
          navigate(`/sigtrap/${err.response.status}`, { replace: true });
        }
        handleHttpError(err as HTTPError, t("game.fetchFailed")!);
      }
    }
    refreshInstitutes();
  });

  return (
    <>
      <Title domain={gameStore.current?.name || "CTF"} route={`/games/${gameStore.current?.id}`} />
      {props.children}
      <TeamCover />
    </>
  );
}
