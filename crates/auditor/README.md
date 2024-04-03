# Auditor crate for Ret2Shell

This crate is created for the Ret2Shell project. Its purpose is to monitor player behavior, detect any attempts at cheating, and identify any politically sensitive or inappropriate content being published.

1. Sensitive content detecting: using Ahocorasick algorithm to detect sensitive content which is published by player, the sensitive word list maybe small and strict (for performance improvements), so we can't just ban users by the result, the manual review is also needed.
2. Answer shareing: for the wrong answer, we check whether this answer is related to another player, if so, the two player could be identified as cheating.
3. (ip, player, answer, flag_submit_time): (ip1 == ip2) && abs(flag_submit_time1 - flag_submit_time2) < 1h
4. (instance_start_time, flag_submit_time) < 10min
5. (attachments_download_time, flag_submit_time) < 10min
