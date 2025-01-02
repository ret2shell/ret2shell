import SidebarLayout from "@blocks/sidebar-layout";
import { Permission } from "@models/user";
import { useNavigate } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { Title, tmpl } from "@storage/header";
import { E, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import type { JSX } from "solid-js";
import SideBar from "./_blocks/sidebar";

export default function (props: { children?: JSX.Element }) {
  const navigate = useNavigate();
  if (
    !accountStore.permissions.includes(Permission.Statistics) &&
    !accountStore.permissions.includes(Permission.User) &&
    !accountStore.permissions.includes(Permission.DevOps)
  ) {
    addToast({
      level: "error",
      description: t("admin.permissionDenied")!,
      duration: 5000,
    });
    navigate("/sigtrap/403");
    return null;
  }
  return (
    <>
      <Title title={tmpl`${t("admin.title")} - ${E("platform.name")}`} />
      <SidebarLayout leftBar={() => <SideBar />}>{props.children}</SidebarLayout>
    </>
  );
}
