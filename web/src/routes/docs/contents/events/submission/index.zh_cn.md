解题事件由选手触发，用于通知选手的解题情况。

## 消息格式

你收到的 JSON 消息如下：

```json
{
  "submission": {
    "event_type": "correct", // "correct" | "cheated" | "too_quick"，保证不会有其他值
    "operator": {
      "id": 1,
      "account": "player",
      "nickname": "选手",
      ... // 其他数据库字段，不保证完整，也不保证今后的版本不变更，即使存在也不要使用这些字段
    },
    "team": {
      "id": 1,
      "name": "队伍名称",
      ... // 其他数据库字段，不保证完整，也不保证今后的版本不变更，即使存在也不要使用这些字段
    },
    "peer_team": {
      "id": 1,
      "name": "队伍名称",
      ... // 其他数据库字段，不保证完整，也不保证今后的版本不变更，即使存在也不要使用这些字段
    }, // Team | null，仅当 event_type 为 "cheated" 时不为空
    "blood_state": 1, // number | null, 表示抢血状态，三血以后或者event_type为"too_many_requests"时为null
    "challenge": {
      "id": 1,
      "name": "题目标题",
      "updated_at": 1718493963, // UNIX 时间戳
      "hidden": false,
      "score": 100,
      "content": "题目内容",
      ... // 其他数据库字段，不保证完整，也不保证今后的版本不变更，即使存在也不要使用这些字段
    },
    "submission": {
      "id": 1,
      "created_at": 1718493963, // UNIX 时间戳
      "content": "提交内容",
      "solved": true,
    },
    "reason": "提交次数过多", // 字符串原因
  }
}
```

## 触发规则

选手在正在进行的比赛中解题成功时会触发 `correct` 事件；选手在比赛中作弊时会触发 `cheated` 事件，此时 `submission` 为作弊提交的内容，`peer_team` 是可能疑似作弊的另一只队伍；选手在比赛中提交速度过快时会触发 `too_quick` 事件，此时 `submission` 为最后一次提交的内容。

## 使用场景

适合使用机器人在比赛通知中广播解题情况，并提醒管理员异常提交状态。
