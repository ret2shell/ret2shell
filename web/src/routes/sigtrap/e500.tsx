import { Title, tmpl } from "@storage/header";
import { E, t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title title={tmpl`${t("errors.500")} - ${E("platform.name")}`} />
      <ErrorSection status={500} />
    </>
  );
}
