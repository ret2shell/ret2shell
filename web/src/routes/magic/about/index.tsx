import LogoAnimate from "@assets/animates/logo-animate";
import { Reverier } from "@assets/animates/Reverier";
import { platformStore } from "@storage/platform";
import { fullTheme, t } from "@storage/theme";
import Divider from "@widgets/divider";
import Tag from "@widgets/tag";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Show } from "solid-js";
import thanksForUsingMySoftware from "@assets/imgs/thanks-for-using-my-software.svg";
import { Title } from "@storage/header";

export default function () {
  return (
    <>
      <Title page={t("magic.about.title")} route="/magic/about" />
      <div class="flex-1 relative">
        <div class="absolute h-full w-full overflow-scroll snap-mandatory snap-y">
          <section class="h-full min-h-full snap-center flex flex-col items-center justify-center relative p-3">
            <OverlayScrollbarsComponent
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              class="relative w-full h-full print:h-auto print:overflow-auto"
              defer
            >
              <div class=" w-full flex flex-col items-center justify-center min-h-full">
                <div class="max-w-3xl w-full flex flex-col items-center justify-center space-y-6">
                  <div class="flex flex-row space-x-6 items-center">
                    <LogoAnimate width={80} height={80} />
                    <div class="flex flex-col space-y-1">
                      <h2 class="text-3xl font-bold flex flex-row">
                        <span class="text-primary">R</span>
                        <span class="opacity-80">et</span>
                        <span class="opacity-60">&nbsp;2&nbsp;</span>
                        <span class="text-error">S</span>
                        <span class="opacity-80">hell</span>
                      </h2>
                      <p class="text-base font-bold opacity-60 space-x-2">
                        <Show
                          when={(platformStore.version || "UNKNOWN").includes("*")}
                          fallback={<span class="text-primary">REL</span>}
                        >
                          <span class="text-warning">DEV</span>
                        </Show>
                        <span>{(platformStore.version || "UNKNOWN").replace("*", "")}</span>
                      </p>
                    </div>
                  </div>
                  <Divider class="w-full" />
                  <h3 class="font-bold">Developers</h3>
                  <div class="flex flex-row flex-wrap justify-center">
                    <Tag level="success" class="m-1">
                      <a href="https://github.com/Reverier-Xu" target="_blank" rel="noreferrer">
                        Reverier-Xu
                      </a>
                    </Tag>
                  </div>
                  <h3 class="font-bold">Contributors</h3>
                  <div class="flex flex-row flex-wrap justify-center">
                    <Tag level="info" class="m-1">
                      <a href="https://github.com/cdcq" target="_blank" rel="noreferrer">
                        cdcq
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://github.com/orangecheers-x" target="_blank" rel="noreferrer">
                        Orange Cheers
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://github.com/frankli0324" target="_blank" rel="noreferrer">
                        frankli0324
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://github.com/DX39061" target="_blank" rel="noreferrer">
                        DX3906
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://github.com/GZTimeWalker" target="_blank" rel="noreferrer">
                        GZTime
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://github.com/Cnily03" target="_blank" rel="noreferrer">
                        Cnily03
                      </a>
                    </Tag>
                  </div>
                  {/* <h3 class="font-bold">Artists</h3> */}
                  {/* <div class="flex flex-row flex-wrap justify-center"> */}
                  {/*   <Tag level="info" class="m-1"> */}
                  {/*     <a href="https://github.com/hypnoticss" target="_blank" rel="noreferrer"> */}
                  {/*       hypnotics */}
                  {/*     </a> */}
                  {/*   </Tag> */}
                  {/*   <Tag level="info" class="m-1"> */}
                  {/*     <a href="https://twitter.com/LAttic1ng" target="_blank" rel="noreferrer"> */}
                  {/*       Ac4ae0 */}
                  {/*     </a> */}
                  {/*   </Tag> */}
                  {/*   <Tag level="info" class="m-1"> */}
                  {/*     <a href="https://xyy9233.github.io/" target="_blank" rel="noreferrer"> */}
                  {/*       W3nL0u */}
                  {/*     </a> */}
                  {/*   </Tag> */}
                  {/*   <Tag level="info" class="m-1"> */}
                  {/*     <a href="/#" target="_blank" rel="noreferrer"> */}
                  {/*       yupan */}
                  {/*     </a> */}
                  {/*   </Tag> */}
                  {/* </div> */}
                  {/* <p class="opacity-60"> */}
                  {/*   <span>Prototype of 墨雨鸢 created by</span> */}
                  {/*   &nbsp; */}
                  {/*   <a href="https://github.com/arttnba3">arttnba3 (SumiKiriko)</a> */}
                  {/* </p> */}
                  <h3 class="font-bold">Opensource projects & 3rd libraries</h3>
                  <div class="flex flex-row flex-wrap justify-center">
                    <Tag level="warning" class="m-1">
                      <a href="https://github.com/rust-lang/rust" target="_blank" rel="noreferrer">
                        Rust
                      </a>
                    </Tag>
                    <Tag level="warning" class="m-1">
                      <a href="https://www.typescriptlang.org/" target="_blank" rel="noreferrer">
                        Typescript
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://tokio.rs/" target="_blank" rel="noreferrer">
                        Tokio
                      </a>
                    </Tag>
                    <Tag level="info" class="m-1">
                      <a href="https://solidjs.com/" target="_blank" rel="noreferrer">
                        Solid JS
                      </a>
                    </Tag>
                    <Tag level="success" class="m-1">
                      <a href="https://k3s.io/" target="_blank" rel="noreferrer">
                        K3S
                      </a>
                    </Tag>
                    <Tag level="success" class="m-1">
                      <a href="https://www.postgresql.org/" target="_blank" rel="noreferrer">
                        PostgreSQL
                      </a>
                    </Tag>
                    <Tag level="success" class="m-1">
                      <a href="https://valkey.io/" target="_blank" rel="noreferrer">
                        Valkey
                      </a>
                    </Tag>
                    <Tag level="success" class="m-1">
                      <a href="https://git-scm.com/" target="_blank" rel="noreferrer">
                        Git
                      </a>
                    </Tag>
                    <Tag level="success" class="m-1">
                      <a href="https://rune-rs.github.io/" target="_blank" rel="noreferrer">
                        Rune
                      </a>
                    </Tag>
                  </div>
                </div>
              </div>
            </OverlayScrollbarsComponent>
          </section>
          <section class="h-full min-h-full snap-center flex flex-col items-center justify-center relative space-y-8 p-3">
            <div class="flex flex-row items-center space-x-6">
              <Reverier width={128} height={128} class="" />
              <h2 class="flex flex-col space-y-2 justify-center">
                <span class="text-3xl font-bold">Powered by Reverier</span>
                <span class="opacity-60 self-end">with caffeine, a cat named 'dog', and love.</span>
              </h2>
            </div>
            <p class="font-bold opacity-60 max-w-3xl">
              Idealism is that you will never receive something back,
              <br />
              but nonetheless still decide to give.
              <span class="text-primary animate-ping">_</span>
            </p>
          </section>
          <section class="h-full min-h-full snap-center flex flex-col items-center justify-center relative p-3">
            <img
              src={thanksForUsingMySoftware}
              alt="Thanks for using my software"
              class="w-full max-w-3xl object-contain"
            />
            <p class="opacity-60">{t("platform.thanks")}</p>
          </section>
        </div>
      </div>
    </>
  );
}
