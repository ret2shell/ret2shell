import DarkmodeButton from '../lib/blocks/darkmode-button'
import { setLocale } from '../lib/storage/theme'
import Button from '../lib/widgets/button'
import Card from '../lib/widgets/card'
import Popover from '../lib/widgets/popover'

export default function DiyBox() {
  return (
    <>
      <Popover btnContent={<span class="icon-[fluent--wand-20-regular] w-5 h-5" />} square ghost padding="pt-2">
        <div class="flex flex-col space-y-2">
          <Card>
            <DarkmodeButton />
          </Card>
          <Card contentClass="p-2 flex flex-col space-y-2">
            <ul class="flex flex-row">
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('zh_cn')} square ghost justify="center" size="sm">
                  <span>简</span>
                </Button>
              </li>
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('zh_tw')} square ghost justify="center" size="sm">
                  <span>繁</span>
                </Button>
              </li>
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('en_us')} square ghost justify="center" size="sm">
                  <span>En</span>
                </Button>
              </li>
              <li class="w-full">
                <Button class="w-full" onClick={() => setLocale('ja_jp')} square ghost justify="center" size="sm">
                  <span>な</span>
                </Button>
              </li>
            </ul>
          </Card>
        </div>
      </Popover>
    </>
  )
}
