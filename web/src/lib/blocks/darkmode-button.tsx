import { onCleanup, onMount } from 'solid-js'
import { setColorScheme, themeStore } from '../storage/theme'
import './darkmode-button.scss'

class Star {
  x: number
  y: number
  size: number
  opacity: number
  growth: number
  isIncreasing: boolean

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
    this.size = 0
    this.opacity = 1
    this.growth = 0.1
    this.isIncreasing = true
  }
  update(ctx: CanvasRenderingContext2D) {
    if (this.size > 2.5) {
      this.isIncreasing = false
    }

    if (this.isIncreasing) {
      this.size += this.growth
    } else {
      this.size -= this.growth * 0.5
    }

    this.draw(ctx)
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `#ffffff`
    ctx.fill()
    ctx.closePath()
  }
}

let stars: Array<Star> = []
let starTimer: NodeJS.Timeout

export default function () {
  let wrapper: HTMLButtonElement
  let canvas: HTMLCanvasElement

  onMount(() => {
    const ctx = canvas.getContext('2d')
    canvas.width = wrapper.getBoundingClientRect().width
    canvas.height = wrapper.getBoundingClientRect().height
    const flicker = () => {
      ctx?.clearRect(0, 0, canvas.width, canvas.height)

      stars.forEach((star, i) => {
        if (!star.isIncreasing && star.size < 0.25) {
          stars.splice(i, 1)
        }
        if (ctx) star.update(ctx)
      })
      // console.log(stars.length)
      requestAnimationFrame(flicker)
    }
    flicker()
    starTimer = setInterval(() => {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      stars.push(new Star(x, y))
    }, 150)
  })

  onCleanup(() => {
    clearInterval(starTimer)
  })

  return (
    <button
      ref={wrapper!}
      data-color-scheme={themeStore.colorScheme}
      class="darkmode-wrapper"
      onClick={() => {
        setColorScheme(themeStore.colorScheme === 'dark' ? 'light' : 'dark')
      }}
    >
      <span class="darkmode-button"></span>
      <canvas ref={canvas!} class="darkmode-stars"></canvas>
    </button>
  )
}
