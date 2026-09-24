import { useChallenge, useChallenges } from "@api/challenge";
import { useGame, useSelfSolves } from "@api/game";
import { isAdminOfGame } from "@storage/game";
import { createMemo } from "solid-js";

/// Computes the prerequisite gating state of a challenge. `gated` exempts
/// game admins (mirroring the backend behavior, used to disable actions),
/// while `locked` is the raw state shown to everyone (used for the blur
/// overlay that admins may dismiss).
export function usePrerequisiteGating(props: { gameId: () => number; challengeId: () => number }) {
  const game = useGame({ id: props.gameId });
  const challenge = useChallenge({ game_id: props.gameId, challenge_id: props.challengeId });
  const challenges = useChallenges({ game_id: props.gameId });
  const solves = useSelfSolves({ game_id: props.gameId });

  const solvedIds = createMemo(() => new Set((solves.data ?? []).map((s) => s.challenge_id)));

  const lockedIds = createMemo(() => (challenge.data?.prerequisites ?? []).filter((id) => !solvedIds().has(id)));

  const unsatisfied = createMemo(() => (isAdminOfGame(game.data) ? [] : lockedIds()));

  const gated = createMemo(() => unsatisfied().length > 0);

  const locked = createMemo(() => lockedIds().length > 0);

  const lockedChallenges = createMemo(() =>
    lockedIds().map((id) => ({
      id,
      name: challenges.data?.[0].find((c) => c.id === id)?.name ?? `#${id}`,
    }))
  );

  return { gated, locked, lockedChallenges };
}
