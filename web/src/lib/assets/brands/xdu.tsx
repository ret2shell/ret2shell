import xduLogo from './xdu.svg'

export default function (props: { width?: number; height?: number }) {
  const { width, height } = { width: 24, height: 24, ...props }
  return <img src={xduLogo} width={width} height={height} alt="XDU" />
}
