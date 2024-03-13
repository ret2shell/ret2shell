# Auditor crate for Ret2Shell

This crate is created for the Ret2Shell project. Its purpose is to monitor player behavior, detect any attempts at cheating, and identify any politically sensitive or inappropriate content being published.

1. Sensitive content detecting: using Ahocorasick algorithm to detect sensitive content which is published by player, the sensitive word list maybe small and strict (for performance improvements), so we can't just ban users by the result, the manual review is also needed.
2. IP and account behavior detecting: If multiple account logged in at the same IP, this behavior should be recorded. (maybe this one will produce so many records due to the ISP's NAT?)
3. Answer shareing: for the wrong answer, we check whether this answer is related to another player, if so, the two player could be identified as cheating.
