// let tips = [
//   'Proving P != NP...',
//   'Factoring RSA 4096...',
//   'Dividing by 0...',
//   'Downloading more RAM...',
//   'Ordering 1s and 0s...',
//   'Navigating neural network...',
//   'Importing machine learning...',
//   'Issuing Alice and Bob one-time pads...',
//   'Trying to escape vim...',
//   'Creating unresolved tension...',
//   'Symlinking emacs and vim to ed...',
//   'Training branch predictor...',
//   'Timing cache hits...',
//   'Speculatively executing recipes...',
//   'Adding LLM hallucinations...',
// ]

import { t } from '../storage/theme'

export function randomTips(): string {
  const randomIndex = Math.floor(Math.random() * 15)
  // @ts-expect-error translations is contructed dynamically
  return t(`loading.${randomIndex}`)
}
