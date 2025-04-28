import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("general.network.status.502.title")} route="/sigtrap/502" />
      <ErrorSection status={502} />
    </>
  );
}
