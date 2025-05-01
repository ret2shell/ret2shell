import Spin from "@assets/animates/spin";
import { useLocation, useNavigate } from "@solidjs/router";
import { Title } from "@storage/header";
import { t, themeStore } from "@storage/theme";
import Article from "@widgets/article";
import Divider from "@widgets/divider";
import { Show, createEffect, createSignal } from "solid-js";
import tocJson from "./contents/toc.json";

type DocNode = {
  title: {
    [key: string]: string;
  };
  children?: { [key: string]: DocNode };
};

export default function () {
  const [title, setTitle] = createSignal(null as null | string);
  const [content, setContent] = createSignal(null as null | string);
  const [notFound, setNotFound] = createSignal(false);
  const navigate = useNavigate();
  const comps = import.meta.glob("./contents/**/*.md");
  async function getDoc(path: string) {
    const pathArr = path.split("/");
    const toc = tocJson as { [key: string]: DocNode };
    let node = toc[pathArr[0]];
    for (let i = 1; i < pathArr.length; i++) {
      if (node === undefined || node.children === undefined) {
        setNotFound(true);
        return;
      }
      node = node.children[pathArr[i]];
    }
    if (node === undefined) {
      setNotFound(true);
      return;
    }
    setTitle(node.title[themeStore.locale]);
    try {
      // console.log(comps);
      let locale = themeStore.locale;
      if (comps[`./contents/${path}/index.${locale}.md`] === undefined) {
        locale = "zh_cn";
      }
      const match = comps[`./contents/${path}/index.${locale}.md`];
      const content = (await match()) as { default: string };
      setContent(content.default);
    } catch (_e) {
      // console.error(e);
      setNotFound(true);
    }
  }
  const location = useLocation();
  createEffect(() => {
    setTitle(null);
    setContent(null);
    getDoc(location.pathname.replace("/docs/", ""));
  });
  createEffect(() => {
    if (notFound()) navigate("/sigtrap/404", { replace: true });
  });
  return (
    <>
      <Title page={title() ?? t("docs.title")} route={location.pathname} />
      <div class="flex-1 flex flex-col items-center px-3 lg:px-6">
        <h1 class="text-3xl flex flex-row space-x-4 items-center w-full max-w-5xl justify-start print:justify-center font-bold mt-8 print:mt-16">
          <Show
            when={title()}
            fallback={
              <>
                <Spin width={32} height={32} />
                <span>{t("general.loading.short")}</span>
              </>
            }
          >
            <span>{title()}</span>
          </Show>
        </h1>
        <Divider class="w-full max-w-5xl my-4" />
        <Article class="self-center" content={content() || ""} extra headingAnchors toc />
      </div>
    </>
  );
}
