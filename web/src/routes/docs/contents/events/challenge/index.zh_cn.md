题目事件表示题目状态的变更，但解题事件不在这里，如果需要获取解题事件，请移步 [submission](/docs/events/submission)。

## 消息格式

你收到的 JSON 消息如下：

```json
{
  "challenge": {
    "event_type": "up", // "up" | "down" | "new_hint"，保证不会有其他值
    "operator": {
      "id": 1,
      "account": "admin",
      "nickname": "管理员",
      ... // 其他数据库字段，不保证完整，也不保证今后的版本不变更，即使存在也不要使用这些字段
    },
    "challenge": {
      "id": 1,
      "name": "题目标题",
      "updated_at": 1718493963, // UNIX 时间戳
      "hidden": false,
      "score": 100,
      "content": "题目内容",
      "release_at": 1718493963, // number | null
      "archive_at": 1718493963, // number | null
      ... // 其他数据库字段，不保证完整，也不保证今后的版本不变更，即使存在也不要使用这些字段
    }
  }
}
```

## 触发规则

> [!TIP] TIPS
> challenge 事件仅在管理员手动操作时触发。
>
> 考虑到同一时段内会有多个 challenge 同时发布，为了防止事件过多，challenge 的定时发布功能请考虑使用 HTTP API 获取 game 的相关信息，
> 并从 `game.timeline_presets` 列中读取时段设置的相关信息，然后自行实现定时汇报功能。
>
> ```
> GET /api/game/{game_id}
> ```

> [!WARNING] WARNING Breaking Changes @tag 3.5.5
> challenge 事件反映了所有手动操作，但是 challenge 的可见性并不完全依赖手动操作，也和时段有关。
>
> 在收到事件后，你的实现应当结合 game 是否开始 / challenge 的 release_at / archive_at 来判断此事件是否需要转发到公开场合。

管理员更新题目的 `hidden` 状态或者新建提示时，会立即触发该事件。

其中，`hidden = true` 会触发 `down` 事件，`hidden = false` 会触发 `up` 事件，新建提示会触发 `new_hint` 事件。

## 使用场景

适合在比赛通知中使用，例如使用机器人在群中自动通知题目状态的变化，以便于选手即时查看题目提示。
