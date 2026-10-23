import type { PlatformLicense } from "@api/platform";
import { makePersisted } from "@solid-primitives/storage";
import { createRoot } from "solid-js";
import { createStore, type StoreReturn } from "solid-js/store";

export const frontendCompatVersion = import.meta.env.VITE_COMPAT_VERSION as string;

type PlatformStoreShape = {
  version: string;
  accept_cookies: boolean;
  under_maintenance: boolean;
  backend_online: boolean;
  license: PlatformLicense | null;
  enable_ret2codec: boolean | null;
  readonly isOnline: boolean;
  readonly isCompatible: boolean;
};

const platformRoot = createRoot(() =>
  makePersisted<PlatformStoreShape, StoreReturn<PlatformStoreShape>>(
    createStore<PlatformStoreShape>({
      version: `${frontendCompatVersion}-UNKNOWN-0.0.0`,
      accept_cookies: false,
      under_maintenance: false,
      backend_online: false,
      license: null,
      enable_ret2codec: null,
      get isOnline() {
        return this.backend_online && !this.under_maintenance;
      },
      get isCompatible() {
        return this.version === frontendCompatVersion;
      },
    }),
    { name: "platform" }
  )
);

export const platformStore = platformRoot[0];
export const setPlatformStore = platformRoot[1];
