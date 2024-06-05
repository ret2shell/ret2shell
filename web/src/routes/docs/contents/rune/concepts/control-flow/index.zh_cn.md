Rune 支持多种常见的控制流表达式，我们将在这里介绍。

## `return` 表达式

在上一节中，我们介绍了函数，函数所做的主要事情之一就是返回内容。`return` 表达式允许从函数中返回内容，并且可以提前终止函数的执行。如果没有指定返回值，函数将返回 `()`。

和 Rust 中的特性一致，函数中最后一个表达式的值将被隐式返回，这意味着你可以省略 `return` 关键字。

```rust
fn foo(n) {
    if n < 1 {
        return "less than one";
    }

    "something else"
}

#[test]
fn test_control_flow() {
    assert_eq!(foo(0), "less than one");
    assert_eq!(foo(10), "something else");
}

pub fn main() {
    println!("{}", foo(0)); // => outputs: "less than one"
    println!("{}", foo(10)); // => outputs: "something else"
}
```

```text
$ ret2script scripts/control_flow/numbers_game.rx
less than one
something else
```

## 条件表达式

条件表达式 `if/else` 允许你提供具有一个或多个代码分支的条件，如果条件为 `true`，则运行对应的代码块；否则，检查其他并列条件；最终如果还是没有匹配到对应条件的话，运行 `else` 代码块（如果有的话）。

```rust
pub fn main() {
    let number = 3;

    if number < 5 {
        println!("the number is smaller than 5");
    } else if number < 10 {
        println!("the number is smaller than 10");
    } else {
        println!("the number is 10 or bigger");
    }
}
```

```
$ ret2script scripts/control_flow/conditional.rx
the number is smaller than 5
```

但请注意，如果您有很多条件，使用模式匹配 `match` 可能会更干净，这一节将在 [模式匹配](/docs/rune/concepts/pattern-matching) 中介绍。