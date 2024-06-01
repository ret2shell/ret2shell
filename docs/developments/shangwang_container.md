# MssCTF 适配上网机 API

## 通用定义

错误响应：

```rust
pub struct ErrorResponse {
    pub errors: Vec<Error>,
}

pub struct Error {
    pub message: String,
}
```

```typescript
interface ErrorResponse {
    errors: Error[];
}

interface Error {
    message: string;
}
```

## 申请

```
POST /:user_id
```

响应定义：

```rust
pub struct StartResponse {
    pub address: String,
    pub started_at: i64,
    pub total_remaining: i64, // 时间戳，单位为秒
}
```

```typescript
interface StartResponse {
    address: string;
    started_at: number;
    total_remaining: number; // 时间戳，单位为秒
}
```

其中 `total_remaining` 参数为总共剩余时间，单位为秒，前端使用 `total_remaining * 1000 - (Date.now() - started_at * 1000)` 计算剩余时间。

成功响应示例：

```json
HTTP 201
{ "address": "domain:port", "started_at": 1702118567, "total_remaining": 3600 }
```

失败响应示例：

```json
HTTP 4xx/5xx
{ "errors": [{"message": "xxx"}] }
```

## 状态查询

```
GET /
```

响应定义：

```rust
pub struct UserStatus {
    pub user_id: String,
    pub address: Option<String>,
    pub started_at: Option<i64>,
    pub total_remaining: i64,
}

pub struct StatusResponse {
    pub users: Vec<UserStatus>,
}
```

```typescript
interface UserStatus {
    user_id: string;
    address: string | null;
    started_at: number | null;
    total_remaining: number;
}

interface StatusResponse {
    users: UserStatus[];
}
```

## 单个状态查询

```
GET /:user_id
```

响应定义：

```rust
pub struct UserStatusResponse {
    pub address: Option<String>,
    pub started_at: Option<i64>,
    pub total_remaining: i64,
}
```

```typescript
interface UserStatusResponse {
    address: string | null;
    started_at: number | null;
    total_remaining: number;
}
```

其中 `total_remaining` 参数为总共剩余时间，单位为秒，前端使用 `total_remaining * 1000 - (Date.now() - started_at * 1000)` 计算剩余时间。`total_remaining` 在一次实例申请过程中不应当变化，实例停止后进行更新计算。

如果当前没有实例在运行，那么不应该返回错误，而是返回当前的 `total_remaining`，其他两个字段设置为 `None / null`。

成功响应示例：

```json
HTTP 200
{ "address": "domain:port", "started_at": 1702118567, "total_remaining": 3600 }

HTTP 200
{ "address": null, "started_at": null, "total_remaining": 1145 }
```

失败响应示例：

```json
HTTP 4xx/5xx
{ "errors": [{"message": "xxx"}] }
```

## 手动停止

```
DELETE /:user_id
```

成功响应示例：

```json
HTTP 200
```

失败响应示例：

```json
HTTP 4xx/5xx
{ "errors": [{"message": "xxx"}] }
```
