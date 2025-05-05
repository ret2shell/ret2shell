import { handleHttpError } from "@api";
import { verifyEmail } from "@api/account";
import Spin from "@assets/animates/spin";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import type { HTTPError } from "ky";
import { createMemo, onMount } from "solid-js";

export default function () {
  const [searchParams, _] = useSearchParams();
  const navigate = useNavigate();
  const email = createMemo(() => searchParams.email as string | undefined);
  const token = createMemo(() => searchParams.token as string | undefined);
  onMount(() => {
    setTimeout(async () => {
      if (email() && token()) {
        try {
          await verifyEmail({ email: email()!, token: token()! });
          addToast({
            level: "success",
            description: t("account.verify.status.success.title")!,
            duration: 5000,
          });
          navigate("/account/settings", { replace: true });
        } catch (err) {
          handleHttpError(err as HTTPError, t("account.verify.errors.verify.title")!);
          navigate("/sigtrap/412", { replace: true });
        }
      } else {
        addToast({
          level: "error",
          description: t("account.verify.status.broken.title")!,
          duration: 5000,
        });
        navigate("/sigtrap/418", { replace: true });
      }
    }, 1000);
  });
  return (
    <>
      <Title page={t("account.verify.title")} route="/account/verify" />
      <div class="flex-1 flex flex-row space-x-4 items-center justify-center">
        <Spin />
        <span class="font-bold text-xl">{t("account.verify.status.verifying.title")}</span>
      </div>
    </>
  );
}
