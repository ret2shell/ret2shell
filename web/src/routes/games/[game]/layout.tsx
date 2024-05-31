import { getGame } from "@/lib/api/game";
import { gameStore, setGameStore } from "@/lib/storage/game";
import { Title } from "@/lib/storage/header";
import { useNavigate, useParams } from "@solidjs/router";
import type { HTTPError } from "ky";
import { type JSX, onCleanup } from "solid-js";

export default function (props: { children?: JSX.Element }) {
    const navigate = useNavigate();
    onCleanup(() => {
        setGameStore({ current: null });
    });
    const params = useParams();
    const game_id = Number.parseInt(params.game);
    if (!gameStore.current && game_id) {
        getGame(game_id)
            .then((resp) => {
                // console.log(resp)
                setGameStore({ current: resp });
            })
            .catch((err: HTTPError) => {
                navigate(`/errors/${err.response.status}`, { replace: true });
            });
    }
    return (
        <>
            <Title title={gameStore.current?.name || "CTF"} />
            {props.children}
        </>
    );
}
