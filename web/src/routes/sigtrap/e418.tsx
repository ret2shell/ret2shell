import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("general.network.status.418.title")} route="/sigtrap/418" />
      <ErrorSection status={418} />
    </>
  );
}
