import type { Captcha } from "@models/captcha";
import type { Institute } from "@models/institute";
import type { OAuth } from "@models/oauth";
import type { OAuthProvider } from "@models/oauth-provider";
import type { User } from "@models/user";
import type { CaptchaRequest } from "@models/utils";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { useMutation, useQuery } from "@tanstack/solid-query";
import type { DiagnosticMarker } from "@widgets/editor";
import { HTTPError } from "ky";
import type { DateTime } from "luxon";
import { createMemo } from "solid-js";
import api, { api_root, handleHttpError, inflyClient } from ".";

export async function getCaptcha() {
  return await api.get(`${api_root}/account/captcha`).json<Captcha>();
}

export function useCaptcha({
  timestamp,
  enabled,
  onError,
}: {
  timestamp?: number;
  enabled?: () => boolean;
  onError?: (err: Error) => void;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["account", "captcha", timestamp],
      queryFn: async () => await getCaptcha(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("captcha.errors.fetch.title"));
        onError?.(err);
        return false;
      },
    }),
    () => inflyClient
  );
}

export type RegisterRequest = {
  account: string;
  nickname: string;
  email: string;
  password: string;
} & CaptchaRequest;

export async function register(req: RegisterRequest) {
  return await api.post(`${api_root}/account/register`, { json: req }).json();
}

export function useRegisterMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: register,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.register.status.success.message"),
        duration: 5000,
        // img: xdsecMascotHappy,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.register.errors.register.title"));
      props.onError?.(err);
    },
  }));
}

export type LoginRequest = {
  account: string;
  password: string;
} & CaptchaRequest;

export async function login(req: LoginRequest) {
  return await api.post(`${api_root}/account/login`, { json: req }).json();
}

export function useLoginMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: login,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.login.status.success.message"),
        duration: 5000,
        // img: xdsecMascotHappy,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.login.errors.login.title"));
      props.onError?.(err);
    },
  }));
}

export async function logout() {
  return await api.post(`${api_root}/account/logout`).json();
}

export function useLogoutMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: logout,
    onSuccess: () => {
      props.onSuccess?.();
    },
    onError: (err: Error) => props.onError?.(err),
  }));
}

export type ForgotPasswordRequest = {
  email: string;
} & CaptchaRequest;

export async function forgotPassword(req: ForgotPasswordRequest) {
  return await api.post(`${api_root}/account/forgot`, { json: req }).json();
}

export function useForgotPasswordMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: forgotPassword,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.forgot.status.success.message"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      if (err instanceof HTTPError && err.response.status === 429) {
        addToast({
          level: "error",
          description: t("account.forgot.status.rateExceeded.message"),
          duration: 5000,
        });
      } else {
        handleHttpError(err as Error, t("general.actions.create.status.fail"));
      }
      props.onError?.(err);
    },
  }));
}

export type ResetPasswordRequest = {
  email: string;
  password: string;
  token: string;
} & CaptchaRequest;

export async function resetPassword(req: ResetPasswordRequest) {
  return await api.post(`${api_root}/account/reset`, { json: req }).json();
}

export function useResetPasswordMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: resetPassword,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.reset.status.success.message"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.reset.errors.reset.title"));
      props.onError?.(err);
    },
  }));
}

export type VerifyEmailRequest = {
  token: string;
  email: string;
};

export async function verifyEmail(req: VerifyEmailRequest) {
  return await api.post(`${api_root}/account/verify`, { json: req }).json();
}

export function useVerifyEmailMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: verifyEmail,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.verify.status.success.title"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.verify.errors.verify.title"));
      props.onError?.(err);
    },
  }));
}

export async function resendEmail() {
  return await api.patch(`${api_root}/account/verify`).json();
}

export function useResendEmailMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: resendEmail,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.send.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.send.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getProfile() {
  return await api.get(`${api_root}/account/profile`).json<User>();
}

export function useAccountProfile(props: { enabled?: () => boolean; onError?: (err: Error) => boolean } = {}) {
  return useQuery(
    () => ({
      queryKey: ["account", "profile"],
      queryFn: async () => await getProfile(),
      enabled: props.enabled?.(),
      throwOnError: (err: Error) => props.onError?.(err) ?? false,
    }),
    () => inflyClient
  );
}

export async function changeProfile(req: User) {
  return await api.patch(`${api_root}/account/profile`, { json: req }).json();
}

export function useChangeProfileMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: changeProfile,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.save.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteSelf(captcha: CaptchaRequest) {
  return await api
    .delete(`${api_root}/account/profile`, {
      json: captcha,
    })
    .json<void>();
}

export function useDeleteSelfMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: deleteSelf,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.delete.bye.message"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.delete.errors.delete.title"));
      props.onError?.(err);
    },
  }));
}

export async function getInstitutes() {
  return await api.get(`${api_root}/account/institute`).json<Institute[]>();
}

export function useInstitutes(props: { enabled?: () => boolean; onError?: (err: Error) => boolean } = {}) {
  return useQuery(
    () => ({
      queryKey: ["account", "institute"],
      queryFn: getInstitutes,
      enabled: props.enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("institute.errors.fetchList.title"));
        return props.onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getAccountCode() {
  return await api.get(`${api_root}/account/code`).json<{ code: number; generate_at: DateTime } | null>();
}

export function useAccountCode(props: { enabled?: () => boolean; onError?: (err: Error) => boolean }) {
  return useQuery(
    () => ({
      queryKey: ["account", "code"],
      queryFn: getAccountCode,
      enabled: props.enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("account.errors.fetchCode.title"));
        return props.onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function generateAccountCode() {
  return await api.post(`${api_root}/account/code`).json<{ code: number; generate_at: DateTime }>();
}

export function useGenerateAccountCodeMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: generateAccountCode,
    onSuccess: () => props.onSuccess?.(),
    onError: (err: Error) => {
      handleHttpError(err, t("account.errors.fetchCode.title"));
      props.onError?.(err);
    },
  }));
}

export async function changePassword(req: { old_password: string; new_password: string }) {
  return await api.patch(`${api_root}/account/password`, { json: req }).json();
}

export function useChangePasswordMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: changePassword,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.save.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function getOAuthProviders() {
  return await api.get(`${api_root}/account/oauth/provider`).json<OAuthProvider[]>();
}

export function useOAuthProviders(props: { enabled?: () => boolean; onError?: (err: Error) => boolean } = {}) {
  return useQuery(
    () => ({
      queryKey: ["account", "oauth", "providers"],
      queryFn: getOAuthProviders,
      enabled: props.enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("account.oauth.errors.fetchProvider.title"));
        return props.onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function getOAuthProvider(service: string) {
  return await api
    .get(`${api_root}/account/oauth/provider/${service}`)
    .json<{ item: OAuthProvider; lint: DiagnosticMarker[] | null }>();
}

export function useOAuthProvider({
  service,
  enabled,
  onError,
}: {
  service: () => string;
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
}) {
  const keys = createMemo(() =>
    service ? ["account", "oauth", "provider", service()] : ["account", "oauth", "provider", "unknown"]
  );
  return useQuery(
    () => ({
      queryKey: keys(),
      queryFn: async () => await getOAuthProvider(service?.() ?? "unknown"),
      enabled: enabled?.() ?? false,
      throwOnError: (err: Error) => {
        handleHttpError(err, t("account.oauth.errors.fetchProvider.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateOAuthProvider(service: string, req: OAuthProvider) {
  return await api
    .patch(`${api_root}/account/oauth/provider/${service}`, { json: req })
    .json<{ item: OAuthProvider; lint: string | null }>();
}

export function useUpdateOAuthProviderMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ service, req }: { service: string; req: OAuthProvider }) => updateOAuthProvider(service, req),
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.save.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteOAuthProvider(service: string) {
  return await api.delete(`${api_root}/account/oauth/provider/${service}`).json<void>();
}

export function useDeleteOAuthProviderMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ service }: { service: string }) => deleteOAuthProvider(service),
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function createOAuthProvider(req: OAuthProvider) {
  return await api
    .post(`${api_root}/account/oauth/provider`, { json: req })
    .json<{ item: OAuthProvider; lint: string | null }>();
}

export function useCreateOAuthProviderMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: createOAuthProvider,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.create.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function loginWithOAuth(query: string) {
  return await api.post(`${api_root}/account/oauth/login${query}`).json<{
    token: string | null;
    data: {
      auth_key: string;
      [key: string]: string;
    } | null;
  }>();
}

export function useLoginWithOAuthMutation(
  props: {
    onSuccess?: (resp: {
      token: string | null;
      data: {
        auth_key: string;
        [key: string]: string;
      } | null;
    }) => void;
    onError?: (err: Error) => void;
  } = {}
) {
  return useMutation(() => ({
    mutationFn: loginWithOAuth,
    onSuccess: (resp) => {
      addToast({
        level: "success",
        description: t("account.login.status.success.message"),
        duration: 5000,
      });
      props.onSuccess?.(resp);
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.login.errors.login.title"));
      props.onError?.(err);
    },
  }));
}

export async function registerWithOAuth(
  token: string,
  req: {
    account: string;
    nickname: string;
    email: string;
    password: string;
    captcha_id: string;
    captcha_answer: string;
  }
) {
  return await api
    .post(`${api_root}/account/oauth/register`, {
      json: {
        token,
        ...req,
      },
    })
    .json();
}

export function useRegisterWithOAuthMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ token, data }: { token: string; data: Parameters<typeof registerWithOAuth>[1] }) =>
      registerWithOAuth(token, data),
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("account.register.status.success.message"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.register.errors.register.title"));
      props.onError?.(err);
    },
  }));
}

export async function bindWithOAuth(query: string) {
  return await api.post(`${api_root}/account/oauth/bind${query}`).json();
}

export function useBindWithOAuthMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: bindWithOAuth,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.save.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.oauth.errors.bind.title"));
      props.onError?.(err);
    },
  }));
}

export async function unbindWithOAuth(id: number) {
  return await api
    .delete(`${api_root}/account/oauth/bind`, {
      searchParams: {
        id,
      },
    })
    .json();
}

export function useUnbindWithOAuthMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => unbindWithOAuth(id),
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("account.oauth.errors.unbind.title"));
      props.onError?.(err);
    },
  }));
}

export async function getOAuthStatus() {
  return await api.get(`${api_root}/account/oauth/bind`).json<OAuth[]>();
}

export function useOAuthStatus({
  enabled,
  onError,
}: {
  enabled?: () => boolean;
  onError?: (err: Error) => boolean;
} = {}) {
  return useQuery(
    () => ({
      queryKey: ["account", "oauth", "status"],
      queryFn: async () => await getOAuthStatus(),
      enabled: enabled?.(),
      throwOnError: (err: Error) => {
        handleHttpError(err, t("account.oauth.errors.fetchStatus.title"));
        return onError?.(err) ?? false;
      },
    }),
    () => inflyClient
  );
}

export async function updateInstitute(req: Institute) {
  return await api.patch(`${api_root}/account/institute/${req.id}`, { json: req }).json<Institute>();
}

export function useUpdateInstituteMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: updateInstitute,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.save.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.save.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function createInstitute(req: Institute) {
  return await api.post(`${api_root}/account/institute`, { json: req }).json<Institute>();
}

export function useCreateInstituteMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: createInstitute,
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.create.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.create.status.fail"));
      props.onError?.(err);
    },
  }));
}

export async function deleteInstitute(id: number) {
  return await api.delete(`${api_root}/account/institute/${id}`).json<void>();
}

export function useDeleteInstituteMutation(props: { onSuccess?: () => void; onError?: (err: Error) => void } = {}) {
  return useMutation(() => ({
    mutationFn: ({ id }: { id: number }) => deleteInstitute(id),
    onSuccess: () => {
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success"),
        duration: 5000,
      });
      props.onSuccess?.();
    },
    onError: (err: Error) => {
      handleHttpError(err, t("general.actions.delete.status.fail"));
      props.onError?.(err);
    },
  }));
}
