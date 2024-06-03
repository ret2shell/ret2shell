import { Pagination, type PaginationRootProps } from "@ark-ui/solid";
import { For } from "solid-js";

export default function (props: PaginationRootProps) {
    return (
        <Pagination.Root {...props} class={`flex flex-row space-x-2 items-center justify-center ${props.class}`}>
            <Pagination.PrevTrigger class="btn btn-md btn-square btn-ghost justify-center">
                <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
            </Pagination.PrevTrigger>
            <Pagination.Context>
                {(api) => (
                    <For each={api().pages}>
                        {(page, index) =>
                            page.type === "page" ? (
                                <Pagination.Item
                                    {...page}
                                    class={`btn btn-square btn-md justify-center ${
                                        page.value === api().page ? "btn-primary" : ""
                                    }`}
                                >
                                    {page.value}
                                </Pagination.Item>
                            ) : (
                                <Pagination.Ellipsis index={index()}>&#8230;</Pagination.Ellipsis>
                            )
                        }
                    </For>
                )}
            </Pagination.Context>
            <Pagination.NextTrigger class="btn btn-md btn-square btn-ghost justify-center">
                <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
            </Pagination.NextTrigger>
        </Pagination.Root>
    );
}
