import { useChallenge, useChallenges } from "@api/challenge";
import { useGame, useSelfSolves } from "@api/game";
import { isAdminOfGame } from "@storage/game";
import { createMemo } from "solid-js";

/** Computes the prerequisite gating state of a challenge. `gated` exempts
 * game admins (mirroring the backend behavior, used to disable actions),
 * while `locked` is the raw state shown to everyone (used for the blur
 * overlay that admins may dismiss). The unlock limit — how many
 * prerequisites must be solved, `0` meaning all — is honored on both. */
export function usePrerequisiteGating(props: { gameId: () => number; challengeId: () => number }) {
  const game = useGame({ id: props.gameId });
  const challenge = useChallenge({ game_id: props.gameId, challenge_id: props.challengeId });
  const challenges = useChallenges({ game_id: props.gameId });
  const solves = useSelfSolves({ game_id: props.gameId });

  const solvedIds = createMemo(() => new Set((solves.data ?? []).map((s) => s.challenge_id)));

  const lockedIds = createMemo(() => (challenge.data?.prerequisites ?? []).filter((id) => !solvedIds().has(id)));

  const unlocked = createMemo(() => {
    const total = (challenge.data?.prerequisites ?? []).length;
    const limit = challenge.data?.unlock_limit ?? 0;
    const required = limit <= 0 ? total : Math.min(limit, total);
    return total - lockedIds().length >= required;
  });

  const gated = createMemo(() => !isAdminOfGame(game.data) && !unlocked());

  const locked = createMemo(() => !unlocked());

  const lockedChallenges = createMemo(() =>
    lockedIds().map((id) => ({
      id,
      name: (challenges.data?.[0] ?? []).find((c) => c.id === id)?.name ?? `#${id}`,
    }))
  );

  return { gated, locked, lockedChallenges };
}
