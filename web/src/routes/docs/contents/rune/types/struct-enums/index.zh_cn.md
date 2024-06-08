结构体与枚举类型是可以在 Rune 脚本中定义和使用的复合类型，他们提供了构建数据并将函数关联到数据的能力。

## 结构体

结构体类似于[对象](/docs/rune/types/objects)，但是结构体具有严格定义的结构，其中的键在编译时是已知并且确保存在的。

结构体可以有一个与其关联的 `impl` 块，该块创建可以在该结构上调用的方法。

```rust
struct User {
    username,
    active,
}

impl User {
    fn set_active(self, active) {
        self.active = active;
    }

    fn describe(self) {
        if self.active {
            println(`${self.username} is active`);
        } else {
            println(`${self.username} is inactive`);
        }
    }
}

pub fn main() {
    let user = User { username: "setbac", active: false };

    user.describe();
    user.set_active(true);
    user.describe();
}
```

```
$ ret2script scripts/types/user_database.rx
setbac is inactive
setbac is active
```

像大多数类型一样，结构体也可以进行模式匹配，由于结构体的字段在编译时是已知的，因此编译器可以确保你只使用已定义的字段，未定义字段会在脚本执行前触发编译错误。

```rust
struct User {
    username,
    active,
}

impl User {
    fn describe(self) {
        match self {
            User { username: "setbac", .. } => {
                println("Yep, it's setbac.");
            }
            User { username, .. } => {
                println(`Other user: ${username}.`);
            }
        }
    }
}

pub fn main() {
    let user = User { username: "setbac", active: false };

    user.describe();
    user.username = "newt";
    user.describe();
}
```

```
$ ret2script scripts/types/user_match.rx
Yep, it's setbac.
Other user: newt.
```

## 枚举

Rune 中的枚举与 Rust 相似，允许你定义具有多个变体的类型，其中每个变体都可以保存一组不同的数据。

在动态编程语言中，枚举可能看起来用处不大，Rune 支持枚举的主要目标是尽可能提供与 Rust 的相似性，以便于用户能够在熟悉 Rust 的情况下用自己熟悉的语法迅速学习 Rune，降低学习成本。

在本节中，我们会探讨一些枚举比较有用的情况。

### `Option` 枚举

Rune 具有原生支持的类型 `Option`，与 Rust 中相同，`Option` 可以表示一个包含在 `Option::Some` 中的任意值，也可以表示为一个什么都不包含的 `Option::None`。

```rust
use std::iter::range;

fn count_numbers(limit) {
    let limit = limit.unwrap_or(10);

    for n in range(0, limit) {
        println(`Count: ${n}`);
    }
}

pub fn main() {
    println("First count!");
    count_numbers(None);

    println("Second count!");
    count_numbers(Some(2));
}
```

```
$ ret2script scripts/types/count_numbers.rx
First count!
Count: 0
Count: 1
Count: 2
Count: 3
Count: 4
Count: 5
Count: 6
Count: 7
Count: 8
Count: 9
Second count!
Count: 0
Count: 1
```

使用 `Option`，我们可以轻松处理具有可选参数或者默认值的函数。

更多有关 `Option` 的用法，我们会在 [错误处理](/docs/rune/error-handling) 中进行讨论。
