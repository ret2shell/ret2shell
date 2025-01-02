import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("errors.502")} route="/sigtrap/502" />
      <ErrorSection status={502} />
    </>
  );
}
