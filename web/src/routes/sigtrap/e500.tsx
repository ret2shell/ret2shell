import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("general.network.status.500.title")} route="/sigtrap/500" />
      <ErrorSection status={500} />
    </>
  );
}
