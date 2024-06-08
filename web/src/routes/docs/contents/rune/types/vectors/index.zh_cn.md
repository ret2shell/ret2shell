向量（Vector）是 Rune 的原生数据结构，它是一个动态的列表。向量没有类型，可以存储任何值。

```rust
pub fn main() {
    let values = ["Hello", 114514];

    println(`{values[0]}`);
    println(`{values.1}`); // items in vectors can be accessed like tuple fields.

    for v in values {
        println(`{v}`);
    }
}

```

```
$ ret2script scripts/types/vector.rx
Hello
114514
Hello
114514
```

向量实现了迭代器（Iterator）协议，因此你可以直接迭代它。除此之外，你还可以手动构造迭代器，来获取更加灵活的迭代方式。

```rust
pub fn main() {
    let values = ["Hello", 114514];

    for v in values.iter().rev() {
        println!("{}", v);
    }
}  
```
  
```
$ ret2script scripts/types/vector_iter.rx
114514
Hello
```


