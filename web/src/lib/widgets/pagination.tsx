import { Pagination, type PaginationRootProps } from "@ark-ui/solid";
import clsx from "clsx";
import { For } from "solid-js";

export default function (props: PaginationRootProps) {
  return (
    <Pagination.Root {...props} class={clsx("flex flex-row space-x-2 items-center justify-center", props.class)}>
      <Pagination.Context>
        {(api) => (
          <For each={api().pages}>
            {(page, index) =>
              page.type === "page" ? (
                <Pagination.Item
                  {...page}
                  class={clsx(
                    "btn",
                    "btn-square",
                    "btn-sm",
                    "justify-center",
                    page.value === api().page && "btn-primary"
                  )}
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
    </Pagination.Root>
  );
}
