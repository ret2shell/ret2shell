import KeyGames from "./_blocks/key-games";
import OtherGames from "./_blocks/other-games";

export default function () {
    return (
        <div class="flex-1 relative">
            <div class="lg:absolute lg:h-full lg:w-full overflow-scroll lg:snap-mandatory lg:snap-y">
                <KeyGames />
                <OtherGames />
            </div>
        </div>
    );
}
