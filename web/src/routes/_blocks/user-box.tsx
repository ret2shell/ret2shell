import { generateAccountCode, getAccountCode, logout } from "@/lib/api/account";
import { HostType } from "@/lib/models/game";
import { Permission } from "@/lib/models/user";
import { gameStore } from "@/lib/storage/game";
import { addToast, clearToasts } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Dialog from "@/lib/widgets/dialog";
import TimeProgress from "@/lib/widgets/time-progress";
import Timer from "@/lib/widgets/timer";
import { useNavigate } from "@solidjs/router";
import { accountStore, refreshUser, resetUser } from "@storage/account";
import { t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Card from "@widgets/card";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import type { HTTPError } from "ky";
import type { DateTime } from "luxon";
import { Match, Show, Switch, createEffect, createSignal, onMount, untrack } from "solid-js";

export default function UserBox() {
    createEffect(() => {
        if (accountStore.token) {
            untrack(refreshUser);
        }
    });

    const navigate = useNavigate();
    const [loading, setLoading] = createSignal(false);
    const [code, setCode] = createSignal(null as { code: number; generate_at: DateTime } | null);
    const [loadingCode, setLoadingCode] = createSignal(true);
    function handleLogout() {
        setLoading(true);
        setTimeout(() => {
            void logout().finally(() => {
                resetUser();
                navigate("/");
                clearToasts();
                setLoading(false);
            });
        }, 1000);
    }
    function getCode() {
        setLoadingCode(true);
        void getAccountCode()
            .then(setCode)
            .catch(() => setCode(null))
            .finally(() => setLoadingCode(false));
    }
    function refreshCode() {
        setCode(null);
        setLoadingCode(true);
        setTimeout(() => {
            generateAccountCode()
                .then(setCode)
                .catch((err: HTTPError) => {
                    err.response.text().then((text) => {
                        addToast({
                            level: "error",
                            description: text,
                            duration: 5000,
                        });
                    });
                })
                .finally(() => setLoadingCode(false));
        }, 500);
    }
    createEffect(() => {
        if (accountStore.token) {
            untrack(getCode);
        } else {
            setCode(null);
        }
    });

    return (
        <Show
            when={accountStore.token}
            fallback={
                <Link href="/account/login" title={t("account.login.title")} ghost>
                    <span class="icon-[fluent--person-20-regular] w-5 h-5" />
                    {t("account.login.title")}
                </Link>
            }
        >
            <Popover
                title={t("account.box")}
                btnContent={
                    <Avatar
                        class="w-8 h-8"
                        src={accountStore.info?.avatar || undefined}
                        fallback={accountStore.info?.account || undefined}
                    />
                }
                square
                ghost
                popContentClass="pt-2"
            >
                <div class="flex flex-col space-y-2 max-w-64 w-[calc(100vw-1rem)]">
                    <Card contentClass="p-2 flex flex-col space-y-2">
                        <Link
                            ghost
                            class="h-16 space-x-2 flex-shrink-0 py-1 flex-nowrap"
                            justify="start"
                            href={`/users/${accountStore.info?.id}`}
                        >
                            <Avatar
                                class="w-10 h-10"
                                src={accountStore.info?.avatar || undefined}
                                fallback={accountStore.info?.account || undefined}
                            />
                            <div class="flex flex-col justify-center items-start">
                                <h2 class="font-bold">{accountStore.info?.nickname}</h2>
                                <span class="text-start text-base font-normal opacity-60">
                                    0x{accountStore.info?.id.toString(16).padStart(6, "0")}
                                </span>
                            </div>
                        </Link>
                    </Card>
                    <Card contentClass="p-2 flex flex-col space-y-2">
                        <Dialog
                            size="sm"
                            justify="start"
                            ghost
                            btnContent={
                                <>
                                    <span class="icon-[fluent--person-link-20-regular] w-5 h-5" />
                                    <span>{t("account.code.title")}</span>
                                </>
                            }
                        >
                            <div class="flex flex-col w-64">
                                <div class="w-full h-32 flex flex-col items-center justify-center p-4 space-y-3">
                                    <Show
                                        when={code()}
                                        fallback={
                                            <>
                                                <span class="icon-[fluent--person-link-20-regular] w-10 h-10 opacity-60" />
                                                <span class="opacity-60">{t("account.code.null")}</span>
                                            </>
                                        }
                                    >
                                        <span class="font-extrabold text-5xl tracking-widest">
                                            {code()?.code.toString(16).toUpperCase().padStart(6, "0")}
                                        </span>
                                        <TimeProgress
                                            class="w-full"
                                            startAt={code()!.generate_at}
                                            endAt={code()!.generate_at.plus({ seconds: 300 })}
                                            onTimeout={() => {
                                                setCode(null);
                                            }}
                                        />
                                        <Timer class="opacity-80" end={code()!.generate_at.plus({ seconds: 300 })} />
                                    </Show>
                                </div>
                                <Button
                                    level="primary"
                                    size="sm"
                                    square
                                    title={t("account.code.refresh")}
                                    onClick={refreshCode}
                                    loading={loadingCode()}
                                    disabled={loadingCode()}
                                >
                                    <Show when={!loadingCode()}>
                                        <span class="icon-[fluent--arrow-clockwise-16-regular] w-4 h-4" />
                                    </Show>
                                    <span class="truncate">{t("account.code.refresh")}</span>
                                </Button>
                            </div>
                        </Dialog>
                        <div class="flex flex-row space-x-2">
                            <Link href="/account/settings" ghost size="sm" justify="start" class="flex-1">
                                <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
                                <span>{t("account.settings.title")}</span>
                            </Link>
                            <Button
                                ghost
                                size="sm"
                                square
                                title={t("account.logout")}
                                onClick={handleLogout}
                                loading={loading()}
                            >
                                <Show when={!loading()}>
                                    <span class="icon-[fluent--sign-out-20-regular] w-5 h-5 text-error" />
                                </Show>
                            </Button>
                        </div>
                    </Card>
                    <Show when={gameStore.current && gameStore.current.host_type === HostType.CTFGame}>
                        <Card contentClass="p-2 flex flex-row space-x-2">
                            <Switch>
                                <Match
                                    when={
                                        accountStore.permissions.includes(Permission.Host) ||
                                        (accountStore.permissions.includes(Permission.Game) &&
                                            gameStore.current?.admins.includes(accountStore.id!))
                                    }
                                >
                                    <Button size="sm" justify="start" class="flex-1" disabled>
                                        <span class="icon-[fluent--flag-20-regular] w-5 h-5 text-primary" />
                                        <span>{t("game.adminCanNotTakePartIn")}</span>
                                    </Button>
                                </Match>
                            </Switch>
                        </Card>
                    </Show>
                </div>
            </Popover>
        </Show>
    );
}
