结构体函数是与特定类型关联的函数。大部分编程语言将这一部分称为类与方法。结构体函数采用 `foo.bar()` 的形式调用，其中 `foo` 是一个结构体实例，`bar` 是一个函数。

虽然大部分编程语言将类与方法作为一等公民来实现，但是 Rune 却不能这么做。由于动态语言的特性，我们没有办法在运行前得知这个变量的确切类型，也不能断定这个类型是否有这个函数。因此，Rune 只能在运行时动态查找实例函数，这要求你在编程时需要一再小心，确保你的变量在调用时所具有的类型是正确的。

```rust
struct Foo;

impl Foo {
    fn new() {
        Foo
    }
}

pub fn main() {
    let foo = Foo::new();
    foo.bar();
}
```

```
$ ret2script scripts/structs/struct_functions.rx
error: virtual machine error
   ┌─ scripts/structs/struct_functions.rx:11:5
   │
11 │     foo.bar();
   │     ^^^^^^^^^ missing instance function `0xfb67fa086988a22d` for `type(0xc153807c3ddc98d7)``
```

> 这个错误描述看起来有些难以理解，希望 Rune 以后能够提供更加详细的调试符号信息。

在这个错误报告中，你看到的是类型和函数哈希签名，这个签名在 Rune 中唯一标识了一个项。在运行时，这个项的哈希值是确定性的，因此项 `Foo::new()` 的哈希是始终不变的。

哈希签名的确切实现目前并没有在 Rune 中稳定下来，因此在不同版本中可能会有所不同。你目前还不能依赖这个哈希值来进行任何针对 Rune VM 的底层操作。
