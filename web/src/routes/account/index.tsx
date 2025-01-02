import { useNavigate } from "@solidjs/router";

export default function () {
  const navigate = useNavigate();
  navigate("/account/settings", { replace: true });
  return null;
}
