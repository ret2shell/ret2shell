import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("errors.404")} route="/sigtrap/404" />
      <ErrorSection status={404} />
    </>
  );
}
