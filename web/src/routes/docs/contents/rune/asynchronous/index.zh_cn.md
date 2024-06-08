Rune 对异步具有优先支持，在本节中，我们将简要介绍什么是异步编程，以及如何在 Rune 中使用异步编程。

## 什么是异步编程？

异步编程允许我们同时运行多个任务，并通过简单的语法来处理这些任务的结果。

一个典型的异步例子是从网络请求多个数据，由于时间压力全部都在等待网络返回数据，因此我们使用异步同时请求多个数据能够大量节省时间。

```rust
pub async fn main() {
    let a = http::get("https://ctf.xidian.edu.cn/");
    let b = http::get("https://forensics.xidian.edu.cn/");

    loop {
        let res = select {
            res = a => res?,
            res = b => res?,
        };

        match res {
            () => break,
            result => {
                println(`${result.status()}`);
            }
        }
    }
}
```

```
$ ret2script scripts/asynchronous/async_http.rx
200 OK
200 OK
```

在上面的例子中，我们同时请求了 `https://ctf.xidian.edu.cn/` 和 `https://forensics.xidian.edu.cn/`，并且在两个请求都完成后打印了它们的状态码。

## `select` 语句

Rune 异步编程的基本结构是 `select` 语句，`select` 语句允许我们同时等待多个异步任务的结果。例如我们要进行多个有超时限制的请求：

```rust
struct Timeout;

async fn request(timeout) {
    let request = http::get(`http://httpstat.us/200?sleep=${timeout}`);
    let timeout = time::sleep(time::Duration::from_secs(2));

    let result = select {
        _ = timeout => Err(Timeout),
        res = request => res,
    }?;

    println(`{result.status()}`);
    Ok(())
}

pub async fn main() {
    if let Err(Timeout) = request(1000).await {
        println("Request timed out!");
    }

    if let Err(Timeout) = request(4000).await {
        println("Request timed out!");
    }
}
```
  
```
$ ret2script scripts/asynchronous/async_timeout.rx
200 OK
Request timed out!
```

我们发现一个问题：在这个例子中我们是按顺序请求的，如果我们想同时请求多个数据，并且还想实现超时功能怎么办？

为了解决这个问题，我们需要两个新东西：`async` 和 `await`。

## `async` 函数

`async` 函数和常规函数一样，只不过在调用时 `async` 函数会立即返回一个 `Future` 对象，而不是直接返回结果。

为了获得 `Future` 的结果，我们需要使用 `await` 关键字。`await` 会使当前进程停在这里，直到 `Future` 对应的处理完成并返回结果。

需要注意的是，`await` 只能在 `async` 函数中使用。

```rust
use std::future;

struct Timeout;

async fn request(timeout) {
    let request = http::get(`http://httpstat.us/200?sleep=${timeout}`);
    let timeout = time::sleep(time::Duration::from_secs(2));

    let result = select {
        _ = timeout => Err(Timeout),
        res = request => res,
    }?;

    Ok(result)
}

pub async fn main() {
    for result in future::join([request(1000), request(4000)]).await {
        match result {
            Ok(result) => println(`Result: ${result.status()}`),
            Err(Timeout) => println("Request timed out!"),
        }
    }
}
```

```
$ ret2script scripts/asynchronous/async_timeout2.rx
Result: 200 OK
Request timed out!
```

## `async` 闭包

闭包也可以使用 `async` 关键字作为前缀。

```rust
fn do_request(url) {
    async || {
        Ok(http::get(url).await?.status())
    }
}

pub async fn main() {
    let future = do_request("https://ctf.xidian.edu.cn/");
    let status = future().await?;
    println(`Status: ${status}`);
}
```

```
$ ret2script scripts/asynchronous/async_closure.rx
Status: 200 OK
```

## `Stream` 流

`Stream` 是[生成器](/docs/rune/generators)的异步版本，他们具有几乎相同的 `next` 与 `resume` 函数，但是 `Stream` 必须与 `.await` 一起使用。

```rust
async fn send_requests(list) {
    let client = http::Client::new();

    let do_request = async |url| {
        Ok(client.get(url).send().await?.status())
    };

    for url in list {
        yield do_request(url).await;
    }
}

pub async fn main() {
    let requests = send_requests(["https://google.com", "https://amazon.com"]);

    while let Some(status) = requests.next().await.transpose()? {
        println(`${status}`);
    }
}
```

```
$ ret2script scripts/asynchronous/async_stream.rx
200 OK
200 OK
```
