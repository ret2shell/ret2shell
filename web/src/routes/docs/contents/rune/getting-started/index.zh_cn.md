好了，让我们开始吧，希望接下来的内容足够有趣。

## 设置开发环境

回归终端提供了一个脚本工具 `ret2script` 来测试你的脚本，你也可以使用 Rune 原生的解释器来进行测试。请注意，`ret2script` 提供了一些额外的模块，因此你的脚本可能不能完全在 Rune 原生解释器中运行。

为了防止误用（以及一些自私的原因），回归终端中的题目脚本使用 `.rx` 作为文件后缀名。

### 安装 ret2script

我们使用 Rust 工具链提供的 `cargo` 来安装 `ret2script`，你可以在终端中运行以下命令来安装：

```bash
cargo install ret2script
```

> 如果你想升级 `ret2script`，或者时刻保证你的 `cargo` 工具链是最新的，你可以使用 [`cargo-update`](https://github.com/nabijaczleweli/cargo-update) 工具。

### 安装 Rune 官方环境

Rune 的原生解释器请参考：[Rune-rs](https://rune-rs.github.io/)。

需要注意，回归终端的 Rune 解释器与官方解释器在一些细节与特性支持上稍有群别，不推荐使用官方解释器来测试题目脚本。

## 你好，世界！

在 Rune 中，你可以使用 `dbg` 函数来打印任何你想要打印的东西。`dbg` 可以接收任意类型的参数，并尽力详细的去描述这个参数的信息。

> Rune 暂时还没有配套的调试器、IDE、语言服务器等配套开发设施，因此只能先提供一些方便你编写脚本的内建特性。

```rust
pub fn main() {
    let a = [1, 2, 3];
    let hello = "Hello, world!";
    let b = '🦀';
    let closure = || println("Hello");

    dbg(a);
    dbg(hello);
    dbg(b);
    dbg(function);
    dbg(drop);
    dbg(closure);
}

fn function() {
    42
}
```

它的输出可能是这样的：

```text
$ ret2script scripts/getting-started/dbg.rx
[1, 2, 3]
"Hello, world!"
'今'
dynamic function (at: 0x1a)
native function (0x1bd03b8ee40)
dynamic function (at: 0x17)
```

默认的 dbg 实现将信息输出到 stdout。但根据环境的配置方式，其行为可能会有所不同。在回归终端中，`dbg` 的输出会被作为调试日志的一部分写入 `tracing::debug` 模块中。

除了 `dbg` 之外，Rune 还提供了 `println` 函数。在回归终端中，这个函数的输出会被作为标准输出写入 `tracing::info` 模块中。

Ok(())，现在你已经会运行 Rune 脚本了！接下来，让我们看一些基础概念和内建函数。
