import KeyGames from './_blocks/key-games'

export default function () {
  return (
    <>
      <div class="flex-1 relative">
        <div class="lg:absolute lg:h-full lg:w-full overflow-scroll lg:snap-mandatory lg:snap-y">
          <KeyGames />
          <section id="other-games" class="lg:h-full lg:min-h-full lg:overflow-scroll lg:snap-center flex relative" />
        </div>
      </div>
    </>
  )
}
