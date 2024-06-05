模块与项是组成 Rune 代码的基本组件。

## 项（Item）

Rune 中的一切（函数、类型、导入）都有唯一的名称，我们将其称为一 *项（item）*。Rune 会执行编译期检查，来确保我们代码中使用的每个项都存在。

以下是一些项的示例：

* `std::result::Result`：类型
* `std::iter::range`：函数

第一个 `Result` 是一个枚举，这是一个从 Rust 借鉴而来的概念，枚举中包含了两个变体：`Ok` 和 `Err`。第二个 `range` 是一个函数，它返回一个迭代器，该迭代器生成一个范围内的数字序列。

这两个项都位于 `std` 模块中，但是 `Result` 更加特别，他位于 *prelude* 组中，这意味着我们可以在不使用 `std::` 前缀的情况下直接使用它。那 `range` 函数呢？它是一个普通的函数，我们可以使用 `use` 语句来将其导入到全局符号中。

```rust
use std::iter::range;

pub fn main() {
    dbg(range(0, 10));
}
```

试图引用一个不存在的项会导致编译错误。例如：

```rust
pub fn main() {
    let foo = Foo::new();
}
```

你可能会得到这样的输出：

```
error: compile error
  ┌─ scripts/items_imports/missing_item.rx.fail:2:15
  │
2 │     let foo = Foo::new();
  │               ^^^^^^^^ missing item `Foo::new`
```

与 Python 和 Lua 不同，Rune 脚本中的所有项在编译时都必须是已知的，这是 Rune 提供的静态保证之一。

## 表达式与语句

Rune 是一种表达式语言，这意味着几乎所有的东西都是一个表达式。表达式是一种计算出一个值的代码片段。例如，`1 + 2` 是一个表达式，它计算出 `3`。

语句是一种执行一些操作但不返回值的代码片段。例如，`let x = 5;` 是一个语句，它将 `5` 赋值给 `x`，但是它不返回任何值。

一个语句可以由一个或多个语句构成：

```rust
let x = 5; // 语句
1 + 1      // 表达式
1 + 1;     // 语句
```

## 模块

Rune 支持使用 `mod` 关键字在文件中定义内联模块。

以下是一个内联模块的定义：

```rust
mod foo {
    pub fn number() {
        1
    }
}

mod bar {
    pub fn number() {
        2
    }
}

#[test]
fn inline_modules() {
    assert_eq!(foo::number() + bar::number(), 3);
}

pub fn main() {
    dbg(foo::number() + bar::number());
}
```

## 模块可见性

某个项使用的每个其他项都必须对该项可见。这是由 Rune 的可见性规则定义的，如下所示：

1. 项可以具有继承的（默认为空）或指定的可见性，例如 `pub`；
2. 如果某个项是可见的，那么它的所有父项都必须是可见的；
3. 继承的可见性等同于 `pub(self)`，这意味着只有当前模块可以访问该项；

可见性的修饰符有以下几个：

* `pub`：在任何地方都可见；
* `pub(crate)`：在当前 crate 中可见；
* `pub(super)`：在父模块中可见；
* `pub(self)`：仅在当前模块中可见；

一般来说，Rune 解释器会寻找入口脚本文件中的 `main` 函数，而默认继承的可见性是 `pub(self)`，因此不强制要求将 `main` 函数标记为 `pub`。

对于回归终端的题目脚本也是如此，但是回归终端的题目脚本中 `main` 函数并不会被调用，回归终端会根据需要去直接调用规定的功能函数。

## 基于文件系统的模块

Rune 支持基于文件系统的模块，这一部分介绍可以在 [这里](https://rune-rs.github.io/book/items_imports.html) 找到。但是请注意，回归终端的 Rune 解释器并不支持这一特性，你的脚本必须是单文件的。
