Rune 中的元组类型是一个固定大小的值序列，与[向量](/docs/rune/types/vectors)类似，但是元组的长度是固定的，构造完成之后没有办法改变元组的长度。

一般情况下，元组由于其长度的不可变性（内容依然是可以改变的），其处理性能是要比向量高很多的，因此元组多用于函数需要返回固定数量个返回值等等不需要改变长度的场景。

```rust
pub fn main() {
    let values = ("Now", "You", "See", "Me");
    dbg(values);

    values.2 = "Don't";
    values.3 = "!";
    dbg(values);
}
```

```
$ ret2script scripts/types/tuples.rx
("Now", "You", "See", "Me")
("Now", "You", "Don\'t", "!")
```

以下是一个返回元组的函数示例：

```rust
fn foo() {
    (1, "test")
}

pub fn main() {
    dbg(foo());
}
```

```
$ ret2script scripts/types/tuples_fn.rx
(1, "test")
```

你也可以使用元组来进行模式匹配：

```rust
pub fn main() {
    match ("test", 1) {
        ("test", n) => {
            dbg("the first part was a number:", n);
        }
        _ => {
            dbg("matched something we did not understand");
        }
    }
}
```

```
$ ret2script scripts/types/tuples_match.rx
"the first part was a number:"
1
```
