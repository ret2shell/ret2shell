import { handleHttpError } from "@api";
import { verifyEmail } from "@api/account";
import Spin from "@assets/animates/spin";
// import xdsecMascotHappy from "@assets/imgs/xdsec-mascot-happy.webp";
import { useNavigate, useSearchParams } from "@solidjs/router";
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
            description: t("account.emailVerified")!,
            duration: 5000,
          });
          navigate("/account/settings", { replace: true });
        } catch (err) {
          handleHttpError(err as HTTPError, t("account.emailVerifyFailed")!);
          navigate("/sigtrap/412", { replace: true });
        }
      } else {
        addToast({
          level: "error",
          description: t("account.emailVerifyBroken")!,
          duration: 5000,
        });
        navigate("/sigtrap/418", { replace: true });
      }
    }, 1000);
  });
  return (
    <div class="flex-1 flex flex-col items-center justify-center space-y-8">
      {/* <img src={xdsecMascotHappy} alt="Broken" class="w-48 h-48 animate-bounce" /> */}
      <div class="flex flex-row space-x-4 items-center">
        <Spin />
        <span class="font-bold text-xl">{t("account.verifyingEmail")}...</span>
      </div>
    </div>
  );
}
