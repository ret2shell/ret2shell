import { t } from "@storage/theme";

export function randomTips(prev?: string): string {
  const randomIndex = Math.floor(Math.random() * 16);
  // @ts-expect-error translations are constructed dynamically
  const tip: string = t(`general.loading.${randomIndex.toString().padStart(2, "0")}`);
  // @ts-expect-error translations are constructed dynamically
  return tip === prev ? t(`general.loading.${((randomIndex + 1) % 16).toString().padStart(2, "0")}`) : tip;
}
