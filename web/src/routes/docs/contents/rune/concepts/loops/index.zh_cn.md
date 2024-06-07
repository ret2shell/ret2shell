循环是大部分编程语言通用的基本语法。你可以使用循环重复执行某一个代码块，直到满足某个条件为止。

## `break` 关键字

在 Rune 中，所有循环语法都可以使用 `break` 语句来提前终止。当 Rune 遇到 `break` 语句时，它会立即跳出当前所在的循环，并从循环后的位置继续执行。

```rust
pub fn main() {
    let value = 0;

    while value < 100 {
        if value >= 50 {
            break;
        }

        value = value + 1;
    }

    println(`The value is ${value}`); // => The value is 50
}
```

```
$ ret2script scripts/loops/while_loop.rx
The value is 50
```

## `loop` 循环

`loop` 关键字构建了 Rune 中最基本的循环形式。`loop` 会构建一个永远不会结束的无限循环，直到代码块中遇到显式的 `break` 或 `return` 语句为止。

```rust
use time::Duration;

pub async fn main() {
    loop {
        println("Hello forever!");
        time::sleep(Duration::from_secs(1)).await;
    }
}
```

```
$ ret2script scripts/loops/loop_forever.rx
Hello forever!
Hello forever!
Hello forever!
...
```

> 如果你想要结束这个例子，你需要手动 `Ctrl+C` 终止进程。

### 额外技巧：产值循环

正如我们在 [表达式与语句](http://localhost/docs/rune/concepts/items-imports#%E8%A1%A8%E8%BE%BE%E5%BC%8F%E4%B8%8E%E8%AF%AD%E5%8F%A5) 中所提到的，语句块在 Rune 也可以作为表达式使用。

但是循环块的值应当如何确定？答案是使用 `break` 语句返回一个值。

```rust
pub fn main() {
    let mut value = 0;

    let result = loop {
        if value >= 10 {
            break value;
        }

        value = value + 1;
    };

    println(`The result is ${result}`); // => The result is 10
}
```

```
$ ret2script scripts/loops/loop_with_value.rx
The result is 10
```

`break` 与 `return` 行为相似，在不提供任何返回值的时候，默认为空元组 `()`；提供的值会作为整个 `loop` 表达式的值返回给外面。

请注意，这种用法仅在 `loop` 循环中有效！你可以思考一下，如果 `for` 与 `while` 循环也支持这么用的话，那么如何确定整个块的返回值呢？由于 `for` 与 `while` 循环通过内建条件来控制循环，因此没有一种好的语法设计能够支撑这种用法。同时，`break` 语句也可能在 `for` 与 `while` 循环中引发二义性。

> 请注意，当你把一个代码块当作表达式使用时，一定不要忘记了在块的末尾加上一个分号 `;`，这样代码块表达式才能与前面的 `let` 关键字构成一个完整的语句，不加的话就会触发语法错误。

## `while` 循环

`while` 循环是一种在满足条件时重复执行代码块的循环。当条件为 `false` 时，循环会终止。

```rust
pub fn main() {
    let value = 0;

    while value < 100 {
        if value >= 50 {
            break;
        }

        value = value + 1;
    }

    println(`The value is ${value}`); // => The value is 50
}
```

```
$ ret2script scripts/loops/while_loop.rx
The value is 50
```

## `for` 循环

`for` 循环是一种遍历集合中的每个元素的循环。在 Rune 中，`for` 循环可以遍历数组、向量等集合。

```rust
pub fn main() {
    let numbers = [1, 2, 3, 4, 5];

    for number in numbers {
        println(`The number is ${number}`);
    }

    // also equivalent to this:
    // 1..6 is a range from 1 to 6, excluding 6, if you want to include 6, use 1..=6
    for number in 1..6 {
        println(`The number is ${number}`);
    }
}
```

```
$ ret2script scripts/loops/for_loop.rx
The number is 1
The number is 2
The number is 3
The number is 4
The number is 5
The number is 1
The number is 2
The number is 3
The number is 4
The number is 5
```
