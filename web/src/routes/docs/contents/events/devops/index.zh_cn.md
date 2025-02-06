平台事件会在特定的情况下触发，你可以通过订阅这些事件来警告管理员。

## 消息格式

你收到的 JSON 消息如下：

```json
{
  "devops": {
    "event_type": "cluster_overloaded", // "cluster_overloaded" | "cluster_recovered" | "server_panic"，保证不会有其他值
    "running": 100, // number | null, 正在运行的容器数量
    "pending": 20, // number | null, 队列中等待运行的容器数量
    "message": "xxxx" // string | null, 原因描述
  }
}
```

## 触发规则

选手启动容器时，如果平台负载已满，则会立即触发 `cluster_overloaded` 事件；在平台负载恢复时，会在最后一个队列容器成功启动后触发 `cluster_recovered` 事件。

## 使用场景

适合使用机器人提醒管理员平台负载异常。请注意，此事件在平台持续高负荷时可能会频繁触发，请自行缓存事件数据并控制汇报频率。
