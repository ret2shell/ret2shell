export default function item(props: { width?: number; height?: number }) {
  const { width, height } = { width: 512, height: 512, ...props }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 512 512">
      <path
        fill="#e34647"
        d="M293.5 213a7.7 7.7 0 0 1-5.3-2L256 180.1L223.8 211a7.8 7.8 0 0 1-10.6 0a6.9 6.9 0 0 1 0-10l37.5-35.8a7.8 7.8 0 0 1 10.6 0l37.5 35.7a6.9 6.9 0 0 1 0 10.1a7.7 7.7 0 0 1-5.3 2.1Z"
        opacity="0"
      >
        <animateTransform
          attributeName="transform"
          begin="-1.3s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          type="translate"
          values="0 30; 0 0; 0 -30"
        />
        <animate
          attributeName="opacity"
          begin="-1.3s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          values="0; 1; 0"
        />
      </path>
      <path
        fill="#e34647"
        d="M293.5 258a7.7 7.7 0 0 1-5.3-2L256 225.1L223.8 256a7.8 7.8 0 0 1-10.6 0a6.9 6.9 0 0 1 0-10l37.5-35.8a7.8 7.8 0 0 1 10.6 0l37.5 35.7a6.9 6.9 0 0 1 0 10.1a7.7 7.7 0 0 1-5.3 2.1Z"
        opacity="0"
      >
        <animateTransform
          attributeName="transform"
          begin="-1.2s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          type="translate"
          values="0 30; 0 0; 0 -30"
        />
        <animate
          attributeName="opacity"
          begin="-1.2s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          values="0; 1; 0"
        />
      </path>
      <path
        fill="#e34647"
        d="M293.5 303a7.7 7.7 0 0 1-5.3-2L256 270.1L223.8 301a7.8 7.8 0 0 1-10.6 0a6.9 6.9 0 0 1 0-10l37.5-35.8a7.8 7.8 0 0 1 10.6 0l37.5 35.7a6.9 6.9 0 0 1 0 10.1a7.7 7.7 0 0 1-5.3 2.1Z"
        opacity="0"
      >
        <animateTransform
          attributeName="transform"
          begin="-1.1s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          type="translate"
          values="0 30; 0 0; 0 -30"
        />
        <animate
          attributeName="opacity"
          begin="-1.1s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          values="0; 1; 0"
        />
      </path>
      <path
        fill="#e34647"
        d="M293.5 348a7.7 7.7 0 0 1-5.3-2L256 315.1L223.8 346a7.8 7.8 0 0 1-10.6 0a6.9 6.9 0 0 1 0-10l37.5-35.8a7.8 7.8 0 0 1 10.6 0l37.5 35.7a6.9 6.9 0 0 1 0 10.1a7.7 7.7 0 0 1-5.3 2.1Z"
        opacity="0"
      >
        <animateTransform
          attributeName="transform"
          begin="-1s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          type="translate"
          values="0 30; 0 0; 0 -30"
        />
        <animate
          attributeName="opacity"
          begin="-1s"
          calcMode="spline"
          dur="3s"
          keySplines=".55, 0, .1, 1; .55, 0, .1, 1"
          repeatCount="indefinite"
          values="0; 1; 0"
        />
      </path>
    </svg>
  )
}
