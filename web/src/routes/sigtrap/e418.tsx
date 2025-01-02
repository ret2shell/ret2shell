import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("errors.418")} route="/sigtrap/418" />
      <ErrorSection status={418} />
    </>
  );
}
