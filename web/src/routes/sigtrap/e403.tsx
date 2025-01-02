import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("errors.403")} route="/sigtrap/403" />
      <ErrorSection status={403} />
    </>
  );
}
