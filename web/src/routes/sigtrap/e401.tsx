import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("general.network.status.401.title")} route="/sigtrap/401" />
      <ErrorSection status={401} />
    </>
  );
}
