export default function (props: { width?: number; height?: number }) {
  const { width, height } = { width: 512, height: 512, ...props }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 512 512">
      <path
        fill="none"
        stroke="#cbd5e1"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="24"
        d="M148 376V136"
      />
      <path
        fill="#ef4444"
        d="m191.4 137l28.8 4.3a6.4 6.4 0 0 1 5.4 6.3v73.7a6.4 6.4 0 0 1-5.4 6.3l-28.8 4.2a6.4 6.4 0 0 1-7.3-6.4v-82a6.4 6.4 0 0 1 7.3-6.3Z"
      >
        <animateTransform
          additive="sum"
          attributeName="transform"
          calcMode="spline"
          dur="3s"
          keySplines=".42, 0, .58, 1; .42, 0, .58, 1"
          repeatCount="indefinite"
          type="rotate"
          values="-6 99 184; 6 99 184; -6 99 184"
        />
      </path>
      <path
        fill="#ef4444"
        d="m260.6 146.1l28.8 4.2a6.4 6.4 0 0 1 5.4 6.3v55.6a6.4 6.4 0 0 1-5.5 6.3l-28.7 4.2a6.4 6.4 0 0 1-7.3-6.3v-64a6.4 6.4 0 0 1 7.3-6.3Z"
      >
        <animateTransform
          additive="sum"
          attributeName="transform"
          calcMode="spline"
          dur="3s"
          keySplines=".42, 0, .58, 1; .42, 0, .58, 1"
          repeatCount="indefinite"
          type="rotate"
          values="-6 99 184; 6 99 184; -6 99 184"
        />
        <animateTransform
          additive="sum"
          attributeName="transform"
          calcMode="spline"
          dur="1.5s"
          keySplines=".42, 0, .58, 1; .42, 0, .58, 1"
          repeatCount="indefinite"
          type="translate"
          values="0 0; 5 0; 0 0"
        />
      </path>
      <path
        fill="#ef4444"
        d="m329.8 155.2l28.7 4.2a6.4 6.4 0 0 1 5.5 6.3v37.4a6.4 6.4 0 0 1-5.5 6.3l-28.7 4.2a6.4 6.4 0 0 1-7.3-6.3v-45.8a6.4 6.4 0 0 1 7.3-6.3Z"
      >
        <animateTransform
          additive="sum"
          attributeName="transform"
          calcMode="spline"
          dur="3s"
          keySplines=".42, 0, .58, 1; .42, 0, .58, 1"
          repeatCount="indefinite"
          type="rotate"
          values="-6 99 184; 6 99 184; -6 99 184"
        />
        <animateTransform
          additive="sum"
          attributeName="transform"
          calcMode="spline"
          dur="1.5s"
          keySplines=".42, 0, .58, 1; .42, 0, .58, 1"
          repeatCount="indefinite"
          type="translate"
          values="0 0; 10 0; 0 0"
        />
      </path>
    </svg>
  )
}
