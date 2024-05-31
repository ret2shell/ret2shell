import { t } from "../storage/theme";

export function randomTips(prev?: string): string {
    const randomIndex = Math.floor(Math.random() * 16);
    // @ts-expect-error translations is contructed dynamically
    const tip: string = t(`loading.${randomIndex}`);
    // @ts-expect-error translations is contructed dynamically
    return tip === prev ? t(`loading.${(randomIndex + 1) % 16}`) : tip;
}
