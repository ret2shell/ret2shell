import { hashToHex } from '@lib/utils/hash'

self.addEventListener(
  'message',
  function (e: { data: { challenge: string } }) {
    const criteria = e.data.challenge
    const difficulty = Number.parseInt(criteria.split('#')[0])
    const challenge = criteria.split('#')[1]
    let nonce = 0
    // console.log(`difficulty: ${difficulty}, challenge: ${challenge}, nonce: ${nonce}, criteria: ${criteria}`)
    let result = ''
    while (!result.startsWith(new Array(difficulty + 1).join('0'))) {
      nonce++
      result = hashToHex(new TextEncoder().encode(challenge + nonce.toString(16)))
      // console.log(`nonce: ${nonce}, hash: ${result}`)
    }
    this.postMessage(challenge + nonce.toString(16))
  },
  false
)
