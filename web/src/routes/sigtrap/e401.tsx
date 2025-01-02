import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("errors.401")} route="/sigtrap/401" />
      <ErrorSection status={401} />
    </>
  );
}
