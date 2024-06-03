import Challenge from "@/lib/blocks/challenge";
import { trainingStore } from "@/lib/storage/training";
import { useSearchParams } from "@solidjs/router";
import { DateTime } from "luxon";
import { Match, Switch, createMemo } from "solid-js";

export default function () {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedChallengeId = createMemo(() => Number.parseInt(searchParams.challenge || "NaN") || null);
    return (
        <Switch fallback={null}>
            <Match when={selectedChallengeId() !== null}>
                <Challenge
                    inGame={false}
                    store={trainingStore}
                    challenge={{
                        id: selectedChallengeId()!,
                        name: "Challenge",
                        score: 100,
                        game_id: 1,
                        content: "Content",
                        updated_at: DateTime.now(),
                        hidden: false,
                        tag: [{ name: "Reverse", primary: true }],
                        score_rule: { initial: 1000, minimum: 500, decay: 10 },
                        bucket: "",
                    }}
                />
            </Match>
        </Switch>
    );
}
