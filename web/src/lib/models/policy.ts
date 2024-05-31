export type GamePolicyRule = {
    game_id: number;
};

export type UserPolicyRule = {
    restrict: boolean;
    institutes: number[];
};
export type StatisticsPolicyRule = {
    restrict: boolean;
    institutes: number[];
};

export type Policy = {
    id: number;
    user_id: number;
    perm_type: string;
    rule: GamePolicyRule | UserPolicyRule | StatisticsPolicyRule;
};
