import Challenge from "@/lib/blocks/challenge";
import SidebarLayout from "@/lib/blocks/sidebar-layout";
import type { Challenge as ChallengeModel } from "@/lib/models/challenge";
import { Permission } from "@/lib/models/user";
import { accountStore } from "@/lib/storage/account";
import { gameStore } from "@/lib/storage/game";
import { Title } from "@/lib/storage/header";
import { fullTheme, t } from "@/lib/storage/theme";
import Link from "@/lib/widgets/link";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import Challenges from "./_blocks/challenges";
import Create from "./_blocks/create";
import Notifications from "./_blocks/notifications";
import Team from "./_blocks/team";
import Welcome from "./_blocks/welcome";

export default function () {
    const navigate = useNavigate();
    if (accountStore.token === null) {
        navigate(`/account/login?redirect=/games/${gameStore.current ? gameStore.current.id : ""}`);
        return null;
    }
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedChallengeId = createMemo(() => Number.parseInt(searchParams.challenge || "NaN") || null);
    const inCreate = createMemo(() => searchParams.create === "true");
    const [challengeHistory, setChallengeHistory] = createSignal<{ id: number; name: string }[]>([]);
    function appendChallengeHistory(challenge: ChallengeModel) {
        if (challengeHistory().find((c) => c.id === challenge.id)) {
            return;
        }
        setChallengeHistory([...challengeHistory(), { id: challenge.id, name: challenge.name }]);
    }
    // TODO: fetchSelfTeam and redirect
    return (
        <>
            <Title title={`${t("game.challenge.title")} - ${gameStore.current?.name || "CTF"}`} />
            <SidebarLayout
                leftBar={<Challenges />}
                rightBar={
                    <div class="flex flex-col">
                        <Team />
                        <Notifications />
                    </div>
                }
            >
                <div class="flex-1 flex flex-col w-0">
                    <OverlayScrollbarsComponent
                        class="w-full h-16 backdrop-blur border-b border-b-layer-content/10 relative"
                        options={{
                            scrollbars: {
                                theme: `os-theme-${fullTheme()}`,
                                autoHide: "scroll",
                            },
                        }}
                        defer
                    >
                        <div class="h-full flex px-2 py-0 items-center space-x-2 min-w-max w-max">
                            <Link
                                href={`/games/${gameStore.current?.id}/challenges`}
                                onClick={() => setSearchParams({ challenge: null })}
                                ghost
                                active={selectedChallengeId() === null && inCreate() === false}
                            >
                                <span class="icon-[fluent--home-20-regular] w-5 h-5" />
                                <span>{t("game.challenge.welcome")}</span>
                            </Link>

                            <Show when={accountStore.permissions.includes(Permission.Game)}>
                                <Link
                                    active={inCreate()}
                                    title={t("form.create")}
                                    ghost
                                    href={`/games/${gameStore.current?.id}/challenges?create=true`}
                                >
                                    <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                                    <span>{t("form.create")}</span>
                                </Link>
                            </Show>
                            <For each={challengeHistory()}>
                                {(challenge) => (
                                    <Link
                                        href={`/games/${gameStore.current?.id}/challenges?challenge=${challenge.id}`}
                                        onClick={() => setSearchParams({ challenge: challenge.id })}
                                        active={challenge.id === selectedChallengeId() && inCreate() === false}
                                        ghost
                                    >
                                        <span class="icon-[fluent--code-20-regular] w-5 h-5" />
                                        <span>{challenge.name}</span>
                                    </Link>
                                )}
                            </For>
                        </div>
                    </OverlayScrollbarsComponent>
                    <Switch fallback={<Welcome />}>
                        <Match when={inCreate()}>
                            <Create />
                        </Match>
                        <Match when={selectedChallengeId() !== null}>
                            <Challenge
                                inGame
                                store={gameStore}
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
                </div>
            </SidebarLayout>
        </>
    );
}
