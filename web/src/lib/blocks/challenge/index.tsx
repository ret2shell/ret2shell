import { Challenge } from '@models/challenge'
import Splitter from '@widgets/splitter'

export default function (props: { challenge?: Challenge; onStateChange?: (challenge: Challenge) => void }) {
  return (
    <div class="flex-1">
      <Splitter
        startPanel={<div></div>}
        endPanel={<div></div>}
        orientation="vertical"
        size={[
          { id: 'a', size: 64, minSize: 36 },
          { id: 'b', size: 36, minSize: 20 },
        ]}
      ></Splitter>
    </div>
  )
}
