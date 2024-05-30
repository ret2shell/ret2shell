import { t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Input from '@/lib/widgets/input'
import xdsecMascotUnsee from '@assets/imgs/xdsec-mascot-unsee.webp'
import xdsecMascotHappy from '@assets/imgs/xdsec-mascot-happy.webp'

export default function () {
  return (
    <>
      <div class="flex flex-col min-h-full">
        <div class="flex flex-col flex-1 p-3 lg:p-6 space-y-4">
          <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
            <img src={xdsecMascotHappy} width={40} height={40} />
            <div class="w-4"></div>
            <Card contentClass="p-2">
              <p class="text-wrap">{t('game.challenge.hammerTips')}</p>
            </Card>
          </div>
          <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
            <img src={xdsecMascotUnsee} width={40} height={40} />
            <div class="w-4"></div>
            <Card contentClass="p-2">
              <p class="text-wrap">{t('game.challenge.hammerTips2')}</p>
            </Card>
          </div>
          {/*
          <div class="self-end flex-row-reverse max-w-[calc(100%-4rem)] flex items-center">
            <Avatar
              class="w-10 h-10"
              src={accountStore.info?.avatar || undefined}
              fallback={accountStore.info?.account || undefined}
            />
            <div class="w-4"></div>
            <Card level="info" contentClass="p-2">
              <p class="text-wrap">Ok(())</p>
            </Card>
          </div>
          */}
        </div>
        <div class="sticky bottom-0 p-3 lg:p-6">
          <Input
            placeholder={t('game.challenge.hammerInput')}
            extraBtn={
              <Button class="!rounded-l-none">
                <span class="icon-[fluent--send-20-regular] w-5 h-5"></span>
              </Button>
            }
          />
        </div>
      </div>
    </>
  )
}
