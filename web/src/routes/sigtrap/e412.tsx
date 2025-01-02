import { Title } from "@storage/header";
import { t } from "@storage/theme";
import ErrorSection from "./error";

export default function () {
  return (
    <>
      <Title page={t("errors.412")} route="/sigtrap/412" />
      <ErrorSection status={412} />
    </>
  );
}
