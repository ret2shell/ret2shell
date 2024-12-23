import xdsecMascotCrying from "./xdsec-mascot-crying.webp";
import xdsecMascotHappy from "./xdsec-mascot-happy.webp";
import xdsecMascotNormal from "./xdsec-mascot-normal.webp";
import xdsecMascotUnsee from "./xdsec-mascot-unsee.webp";
import xdsecMascotDead from "./xdsec-mascot-dead.gif";
import xdsecMascotLoading from "./xdsec-mascot-loading.gif";
import xdsecMascotSparkle from "./xdsec-mascot-sparkle.gif";
import xdsecMascotSpining from "./xdsec-mascot-spining.gif";

export type Sticker = {
  src: string;
  alt: string;
};

export const stickerSet: Sticker[] = [
  { src: xdsecMascotCrying, alt: "Crying" },
  { src: xdsecMascotHappy, alt: "Happy" },
  { src: xdsecMascotNormal, alt: "Stare" },
  { src: xdsecMascotUnsee, alt: "Wink" },
  { src: xdsecMascotDead, alt: "Dead" },
  { src: xdsecMascotLoading, alt: "Loading" },
  { src: xdsecMascotSparkle, alt: "Sparkle" },
  { src: xdsecMascotSpining, alt: "Spining" },
];
