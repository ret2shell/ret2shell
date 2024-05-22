import { api_root } from '@/lib/api'
import { getGameIntroduction, updateGame, updateGameIntroduction } from '@/lib/api/game'
import { uploadMedia } from '@/lib/api/media'
import LogoAnimate from '@/lib/assets/animates/logo-animate'
import Spin from '@/lib/assets/animates/spin'
import { Article as ArticleModel } from '@/lib/models/article'
import { TeamState, stringifyState } from '@/lib/models/team'
import { Permission } from '@/lib/models/user'
import { accountStore, refreshInstitutes } from '@/lib/storage/account'
import { canParticipate, gameStore, isGameAdmin, setGameStore } from '@/lib/storage/game'
import { Title } from '@/lib/storage/header'
import { t } from '@/lib/storage/theme'
import { addToast } from '@/lib/storage/toast'
import { randomTips } from '@/lib/utils/loading-tips'
import { mediaPath } from '@/lib/utils/media'
import Article from '@/lib/widgets/article'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Link from '@/lib/widgets/link'
import Picture from '@/lib/widgets/picture'
import Tag from '@/lib/widgets/tag'
import Timer from '@/lib/widgets/timer'

import bgGameDefault from '@assets/imgs/bg-game-default.webp'
import { HTTPError } from '@reverier/ky'
import { useSearchParams } from '@solidjs/router'
import { DateTime } from 'luxon'
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import IntroForm from './_blocks/intro-form'

export default function () {
  refreshInstitutes()
  const [searchParams, setSearchParams] = useSearchParams()
  const inEdit = () => searchParams.edit === 'true'
  const period = () => {
    if (gameStore.current?.register_at && gameStore.current.register_at > DateTime.now()) {
      return t('game.register')!
    } else if (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()) {
      return t('game.start')!
    } else if (gameStore.current?.end_at && gameStore.current.end_at > DateTime.now()) {
      return t('game.end')!
    } else if (gameStore.current?.archive_at && gameStore.current.archive_at > DateTime.now()) {
      return t('game.archive')!
    }
    return ''
  }

  const timeEnd = () => {
    if (gameStore.current?.register_at && gameStore.current.register_at > DateTime.now()) {
      return gameStore.current.register_at
    } else if (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()) {
      return gameStore.current.start_at
    } else if (gameStore.current?.end_at && gameStore.current.end_at > DateTime.now()) {
      return gameStore.current.end_at
    } else if (gameStore.current?.archive_at && gameStore.current.archive_at > DateTime.now()) {
      return gameStore.current.archive_at
    }
    return DateTime.now()
  }

  const [showTimer, setShowTimer] = createSignal(true)

  const updateTimer = setInterval(() => {
    setShowTimer(!!(gameStore.current?.archive_at && gameStore.current.archive_at > DateTime.now()))
  }, 1000)

  onCleanup(() => clearInterval(updateTimer))

  const [introduction, setIntroduction] = createSignal(null as ArticleModel | null)
  const [loading, setLoading] = createSignal(true)

  createEffect(() => {
    if (gameStore.current?.introduction_id) {
      untrack(() => {
        if (gameStore.current?.introduction_id) {
          getGameIntroduction(gameStore.current.id)
            .then(resp => {
              setIntroduction(resp)
              setLoading(false)
            })
            .catch((err: HTTPError) => {
              err.response.text().then(resp => {
                addToast({
                  level: 'error',
                  description: `${t('game.introduction.fetchFailed')}: ${resp}`,
                  duration: 5000,
                })
              })
              setIntroduction(null)
              setLoading(false)
            })
        } else {
          setIntroduction(null)
          setLoading(false)
        }
      })
    } else {
      setIntroduction(null)
      setLoading(false)
    }
  })

  let coverInput: HTMLInputElement
  const [coverSet, setCoverSet] = createSignal(false)
  const [coverFile, setCoverFile] = createSignal(null as File | null)
  const [coverUploading, setCoverUploading] = createSignal(false)
  function handleSelectCover() {
    coverInput.click()
  }
  function handleSelectedCover(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      if (gameStore.current)
        setGameStore({
          current: {
            ...gameStore.current,
            cover: URL.createObjectURL((event.target as HTMLInputElement).files![0]),
          },
        })
      setCoverFile((event.target as HTMLInputElement).files![0])
      setCoverSet(true)
    }
  }
  function handleUploadCover() {
    if (coverFile())
      uploadMedia(coverFile()!, false)
        .then(resp => {
          if (gameStore.current)
            updateGame(gameStore.current.id, {
              ...gameStore.current,
              cover: resp.hash,
            })
              .then(resp => {
                setGameStore({ current: resp })
                addToast({
                  level: 'success',
                  description: t('game.cover.uploaded')!,
                  duration: 5000,
                })
              })
              .catch((err: HTTPError) => {
                err.response.text().then(resp => {
                  addToast({
                    level: 'error',
                    description: `${t('game.cover.uploadFailed')}: ${resp}`,
                    duration: 5000,
                  })
                })
              })
              .finally(() => {
                setCoverUploading(false)
                setCoverFile(null)
                setCoverSet(false)
              })
        })
        .catch((err: HTTPError) => {
          err.response.text().then(resp => {
            addToast({
              level: 'error',
              description: `${t('game.cover.uploadFailed')}: ${resp}`,
              duration: 5000,
            })
          })
        })
  }
  const [logoSet, setLogoSet] = createSignal(false)
  const [logoFile, setLogoFile] = createSignal(null as File | null)
  const [logoUploading, setLogoUploading] = createSignal(false)
  let logoInput: HTMLInputElement
  function handleSelectLogo() {
    logoInput.click()
  }
  function handleSelectedLogo(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      if (gameStore.current)
        setGameStore({
          current: {
            ...gameStore.current,
            logo: URL.createObjectURL((event.target as HTMLInputElement).files![0]),
          },
        })
      setLogoFile((event.target as HTMLInputElement).files![0])
      setLogoSet(true)
    }
  }
  function handleUploadLogo() {
    if (logoFile())
      uploadMedia(logoFile()!, false)
        .then(resp => {
          if (gameStore.current)
            updateGame(gameStore.current.id, {
              ...gameStore.current,
              logo: resp.hash,
            })
              .then(resp => {
                setGameStore({ current: resp })
                addToast({
                  level: 'success',
                  description: t('game.logo.uploaded')!,
                  duration: 5000,
                })
              })
              .catch((err: HTTPError) => {
                err.response.text().then(resp => {
                  addToast({
                    level: 'error',
                    description: `${t('game.logo.uploadFailed')}: ${resp}`,
                    duration: 5000,
                  })
                })
              })
              .finally(() => {
                setLogoUploading(false)
                setLogoFile(null)
                setLogoSet(false)
              })
        })
        .catch((err: HTTPError) => {
          err.response.text().then(resp => {
            addToast({
              level: 'error',
              description: `${t('game.logo.uploadFailed')}: ${resp}`,
              duration: 5000,
            })
          })
        })
  }

  async function onUpdateIntroduction(result: ArticleModel) {
    try {
      let resp = await updateGameIntroduction(gameStore.current!.id, result)
      setIntroduction(resp)
      setSearchParams({ edit: null })
    } catch (err) {
      let errorString = await (err as HTTPError).response.text()
      addToast({
        level: 'error',
        description: `${t('game.introduction.updateFailed')}: ${errorString}`,
        duration: 5000,
      })
    }
  }

  return (
    <>
      <Title title={gameStore.current?.name || 'CTF'} />
      <div class="flex-1 flex flex-col lg:flex-row-reverse">
        <div class="lg:w-1/3 max-h-[calc(100vh-4rem)] lg:sticky lg:top-16 lg:left-0 flex flex-col backdrop-blur border-b border-b-layer-content/10 lg:border-b-0 lg:backdrop-blur-none p-3 lg:p-6 space-y-2">
          <Card contentClass="relative">
            <Picture
              class="aspect-video"
              src={(gameStore.current?.cover && mediaPath(gameStore.current.cover)) || bgGameDefault}
            ></Picture>

            <div class="absolute top-0 left-0 w-full h-full flex flex-col justify-end items-end z-10 p-3 lg:p-6 space-y-2">
              <Show when={isGameAdmin()}>
                <div class="flex flex-row space-x-2">
                  <Button
                    square
                    size="sm"
                    class="bg-layer/50"
                    onClick={() => (coverSet() ? handleUploadCover() : handleSelectCover())}
                    loading={coverUploading()}
                    disabled={logoSet()}
                  >
                    <input type="file" class="hidden" ref={coverInput!} onChange={handleSelectedCover} />
                    <Show
                      when={coverSet()}
                      fallback={<span class="icon-[fluent--draw-image-20-regular] w-5 h-5"></span>}
                    >
                      <span class="icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5 text-primary"></span>
                    </Show>
                  </Button>
                  <Button
                    square
                    size="sm"
                    class="bg-layer/50"
                    onClick={() => (logoSet() ? handleUploadLogo() : handleSelectLogo())}
                    loading={logoUploading()}
                    disabled={coverSet()}
                  >
                    <input type="file" class="hidden" ref={logoInput!} onChange={handleSelectedLogo} />
                    <Show when={logoSet()} fallback={<span class="icon-[fluent--flag-20-regular] w-5 h-5"></span>}>
                      <span class="icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5 text-primary"></span>
                    </Show>
                  </Button>
                </div>
              </Show>
              <h2 class="font-bold p-4 rounded-lg bg-layer/50 backdrop-blur flex flex-row space-x-2 w-full">
                <div class="mx-4">
                  <Show
                    when={gameStore.current?.logo}
                    fallback={
                      <Show when={loading()} fallback={<LogoAnimate width={64} height={64} />}>
                        <Spin width={64} height={64}></Spin>
                      </Show>
                    }
                  >
                    <img src={mediaPath(gameStore.current!.logo!)} width={64} height={64}></img>
                  </Show>
                </div>
                <div class="flex flex-col space-y-2">
                  <span class="text-3xl">{gameStore.current?.name}</span>
                  <span class="opacity-80">{gameStore.current?.brief}</span>
                </div>
              </h2>
            </div>
          </Card>
          <div class="flex flex-col space-y-2 items-center py-4 lg:py-8">
            <Show when={showTimer()} fallback={<span class="text-3xl font-bold text-warning">{t('game.ended')}</span>}>
              <h3 class="text-xl font-bold opacity-60">{t('game.timerTips', { period: period() })}</h3>
              <p class="text-3xl font-bold">
                <Timer end={timeEnd()}></Timer>
              </p>
            </Show>
          </div>
          <div class="flex-1 hidden lg:flex flex-col">
            <div class="flex flex-row flex-wrap items-start justify-center">
              <Tag level="info" class="m-2">
                <Show
                  when={gameStore.current?.team_size && gameStore.current.team_size > 1}
                  fallback={<span>{t('game.team.solo')}</span>}
                >
                  <span>{t('game.team.collab', { size: gameStore.current?.team_size || 0 })}</span>
                </Show>
              </Tag>
              <Show
                when={gameStore.current?.access_policy.restrict}
                fallback={
                  <Tag level="success" class="m-2">
                    <span>{t('game.accessPolicy.open')}</span>
                  </Tag>
                }
              >
                <For each={gameStore.current?.access_policy.institutes}>
                  {institute => (
                    <Tag level="success" class="m-2">
                      <span>{accountStore.institutes.find(v => v.id === institute)?.name}</span>
                    </Tag>
                  )}
                </For>
              </Show>
              <Show when={gameStore.current?.hidden}>
                <Tag level="warning" class="m-2">
                  <span>{t('game.hidden')}</span>
                </Tag>
              </Show>
              <Show when={gameStore.current?.frozen}>
                <Tag level="warning" class="m-2">
                  <span>{t('game.frozen')}</span>
                </Tag>
              </Show>
            </div>
          </div>
          <Show when={gameStore.team}>
            <Card contentClass="p-3 lg:p-6 flex flex-row space-x-2 lg:space-x-4">
              <div class="lg:p-2 flex items-center justify-center">
                <span class="icon-[fluent--flag-20-filled] w-5 h-5 lg:w-10 lg:h-10 text-primary opacity-60"></span>
              </div>
              <div class="flex flex-col justify-center flex-1">
                <h3 class="font-bold lg:text-xl px-2">
                  <span>{gameStore.team?.name}</span>
                  <span>&nbsp;</span>
                  <span class="text-primary">#</span>
                  <span class="opacity-60">{gameStore.team?.id.toString(16).padStart(6, '0')}</span>
                </h3>
                <p class="flex-row flex-wrap hidden lg:flex space-x-2 px-2 opacity-60">
                  <span>{stringifyState(gameStore.team?.state || TeamState.Pending)}</span>
                  <span class="opacity-60 text-primary">-</span>
                  <span>{gameStore.team?.institute_name || t('account.institute.none')}</span>
                  <span class="opacity-60 text-primary">-</span>
                  <span>{gameStore.team?.score || 0} pts</span>
                </p>
              </div>
              <p class="flex items-center justify-center font-bold lg:text-xl">
                <span class="opacity-60">No.</span>
                <span class="text-primary">{gameStore.rank || 'NULL'}</span>
              </p>
            </Card>
          </Show>
          <div class="flex flex-row space-x-2">
            <Show
              when={
                accountStore.id &&
                ((gameStore.current?.admins.includes(accountStore.id) &&
                  accountStore.permissions.includes(Permission.Game)) ||
                  accountStore.permissions.includes(Permission.Host))
              }
            >
              <Link href={`/games/${gameStore.current?.id}?edit=true`} square level="primary">
                <span class="icon-[fluent--edit-20-regular] w-5 h-5"></span>
              </Link>
            </Show>
            <Show
              when={
                accountStore.id &&
                ((gameStore.current?.admins.includes(accountStore.id) &&
                  accountStore.permissions.includes(Permission.Game)) ||
                  accountStore.permissions.includes(Permission.Host))
              }
            >
              <Link href={`/games/${gameStore.current?.id}/admin`} square level="primary">
                <span class="icon-[fluent--settings-20-regular] w-5 h-5"></span>
              </Link>
            </Show>
            <Switch>
              <Match when={gameStore.team}>
                <Link
                  href={`/games/${gameStore.current?.id}/challenges`}
                  class="flex-1"
                  level="success"
                  disabled={
                    (gameStore.current?.archive_at && gameStore.current.archive_at < DateTime.now()) ||
                    (gameStore.current?.start_at && gameStore.current.start_at > DateTime.now())
                  }
                >
                  <span class="icon-[fluent--people-team-20-regular] w-5 h-5"></span>
                  <Switch>
                    <Match when={gameStore.current?.archive_at && gameStore.current.archive_at < DateTime.now()}>
                      <span class="flex-1 text-start">{t('game.archivedGotoTraining')}</span>
                    </Match>
                    <Match when={gameStore.current?.start_at && gameStore.current.start_at > DateTime.now()}>
                      <span class="flex-1 text-start">{t('game.challenge.notStarted')}</span>
                    </Match>
                    <Match when={true}>
                      <span class="flex-1 text-start">{t('game.challenge.enter')}</span>
                    </Match>
                  </Switch>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5"></span>
                </Link>
              </Match>
              <Match
                when={
                  accountStore.id &&
                  accountStore.permissions.includes(Permission.Game) &&
                  gameStore.current?.admins.includes(accountStore.id)
                }
              >
                <Link
                  level="success"
                  class="flex-1"
                  href={`/games/${gameStore.current?.id}/challenges`}
                  justify="start"
                >
                  <span class="icon-[fluent--code-20-filled] w-5 h-5"></span>
                  <span class="flex-1 text-start">{t('game.admin.manageChallenges')}</span>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5"></span>
                </Link>
              </Match>
              <Match when={accountStore.id && !gameStore.team}>
                <Link
                  href={`/games/${gameStore.current?.id}/teams/create`}
                  class="flex-1"
                  level="info"
                  disabled={!canParticipate()}
                >
                  <span class="icon-[fluent--people-team-20-regular] w-5 h-5"></span>
                  <Show
                    when={canParticipate()}
                    fallback={<span class="flex-1 text-start">{t('game.canNotParticipate')}</span>}
                  >
                    <span class="flex-1 text-start">{t('game.team.create.title')}</span>
                  </Show>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5"></span>
                </Link>
              </Match>
              <Match when={!accountStore.id}>
                <Link
                  href={`/account/login?redirect=${encodeURI(`/games/${gameStore.current?.id}/teams/create`)}`}
                  class="flex-1"
                  level="warning"
                >
                  <span class="icon-[fluent--person-20-regular] w-5 h-5"></span>
                  <span class="flex-1 text-start">{t('game.team.loginThenBack')}</span>
                  <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5"></span>
                </Link>
              </Match>
            </Switch>
          </div>
        </div>
        <div class="flex-1 flex flex-col space-y-2">
          <h1 class="text-center text-3xl font-bold mt-4 lg:mt-8">{t('game.introduction.title')}</h1>
          <Switch>
            <Match when={inEdit()}>
              <IntroForm onDone={onUpdateIntroduction} editSource={introduction() || undefined} />
            </Match>
            <Match when={introduction() && !loading()}>
              <Article
                class="self-center"
                content={introduction()!.content!}
                extra={true}
                headingAnchors={true}
              ></Article>
            </Match>
            <Match when={loading()}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <Spin width={32} height={32}></Spin>
                <span>{randomTips()}</span>
              </div>
            </Match>
            <Match when={true}>
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="icon-[fluent--thumb-dislike-20-regular] w-24 h-24"></span>
                <span>{t('game.introduction.empty')}</span>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
    </>
  )
}
