const gitmojiMap: Record<string, string> = {
  ":sparkles:": "sparkles",
  ":building_construction:": "building-construction",
  ":package:": "package",
  ":fire:": "fire",
  ":speech_balloon:": "speech-balloon",
  ":memo:": "memo",
  ":tada:": "party-popper",
  ":arrow_up:": "up-arrow",
};

export function transformGitmoji(message: string): { icon?: string; text: string } {
  for (const [gitmoji, icon] of Object.entries(gitmojiMap)) {
    if (message.startsWith(gitmoji)) {
      return {
        icon: `icon-[fluent-emoji-flat--${icon}]`,
        text: message.slice(gitmoji.length).trimStart(),
      };
    }
  }
  return { text: message };
}
