export default function (props: { width?: number; height?: number }) {
  const { width, height } = { width: 24, height: 24, ...props }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1">
        <path
          class="animate-pulse"
          stroke-dasharray="12 6.67"
          stroke-dashoffset="18.67"
          stroke-opacity="0.6"
          d="M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21"
        >
          <animate attributeName="stroke-dashoffset" dur="0.6s" repeatCount="indefinite" values="18.67;0" />
        </path>
        {/* <path stroke-dasharray="30" stroke-dashoffset="30" d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21">
      <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.1s" dur="0.3s" values="30;0" />
    </path> */}
        <path
          fill="currentColor"
          d="M15.986 11.25a.856.856 0 0 1 0 1.5l-5.716 3.144A.858.858 0 0 1 9 15.143V8.856a.858.858 0 0 1 1.27-.75zm-.276 1a.286.286 0 0 0 0-.5L9.995 8.604a.286.286 0 0 0-.424.251v6.287a.286.286 0 0 0 .424.25z"
          style="stroke-width:.571629"
        />
      </g>
    </svg>
  )
}
