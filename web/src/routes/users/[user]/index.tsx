import SidebarLayout from "@/lib/blocks/sidebar-layout";
import Sidebar from "./_blocks/sidebar";

export default function () {
    return <SidebarLayout leftBar={<Sidebar />}>{null}</SidebarLayout>;
}
