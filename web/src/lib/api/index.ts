import { luxonReplacer, luxonReviver } from "@models/utils";
import { accountStore, resetUser, storeToken } from "@storage/account";
import ky from "ky";

export const api_root = (import.meta.env.VITE_API_ROOT as string) || "/api";

const api = ky.extend({
    parseJson: (text) => JSON.parse(text, luxonReviver) as unknown,
    stringifyJson: (data) => JSON.stringify(data, luxonReplacer),
    hooks: {
        beforeRequest: [
            (request) => {
                const token = accountStore.token;
                if (token) {
                    request.headers.set("Authorization", `Bearer ${token}`);
                }
            },
        ],
        afterResponse: [
            (_request, _options, response) => {
                if (response.status === 401) {
                    resetUser();
                }
                if (response.headers.has("Set-Token")) {
                    const token = response.headers.get("Set-Token");
                    if (token) {
                        storeToken(token);
                    }
                }
            },
        ],
    },
});

export default api;
