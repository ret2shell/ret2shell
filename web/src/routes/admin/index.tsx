import { useNavigate } from "@solidjs/router";

export default function () {
  const navigate = useNavigate();
  navigate("/admin/statistics", { replace: true });
  return null;
}
