Rune 中将数据类型区分为两种，一种是**基本类型**（也可以称为**原语 Primitive**），另一种是**引用类型 Reference**。

## 基本类型

基本类型是直接存储在堆栈上的类型。在 Rune 的解释器实现中，基本类型都实现了 `Copy` 特性，因此在你操作这些类型时，涉及数据移动的操作都会创建基础值的不同副本，复制后的副本之间不会相互影响。

Rune 中的基本类型有：

* 单元类型（空元组） `()`，表示没有值；
* 布尔值 `bool`，表示逻辑值 `true` 或 `false`；
* 字节 `u8`，例如 `b'\xff'`；
* 字符 `char`，例如 `'a'` 或者 `'👴'`，其中 `'👴'` 是一个 4 字节的宽 Unicode 字符；
* 整数 `i64`，例如 `114514`，整数都是 64 位有符号整数；
* 浮点数 `f64`，例如 `1919.810`，浮点数都是 64 位双精度浮点数；
* 静态字符串，例如 `"hello"`，静态字符串是不可变的；

当你将这些数据分配给不同的变量时，将会自动创建值的单独副本：

```rust
pub fn main() {
    let a = 1;
    let b = a;
    a = 2;
    println(`{a}`);
    println(`{b}`);
}
```

```
$ ret2script scripts/primitives/copy.rx
2
1
```

基本类型都由小写字母开头，而引用类型则由大写字母开头。

## 引用类型

其他类型（例如*字符串*）通过引用存储。引用类型是指向堆上数据的指针，在对引用类型进行赋值或移动操作时，被复制的只是引用，所有衍生的变量都指向同一个基础数据。

```rust
pub fn main() {
    let a = String::from("Hello");
    let b = a;
    a.push_str(" World");
    println(a);
    println(b);
}
```

```
$ ret2script scripts/primitives/reference.rx
"Hello World"
"Hello World"
```

Rune 支持的一些引用类型有：

* 字符串 `String`，例如 `String::from("Hello")`；
* 向量 `Vec`，例如 `[1, 2, 3]`；
* 对象 `Object`，例如 `#{ "name": "Rune" }`；
* 元组 `Tuple`，例如 `(1, 2, 3)`；
