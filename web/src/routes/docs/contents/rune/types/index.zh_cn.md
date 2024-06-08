Rune 中包含了一些常见的数据类型，同时也支持通过各种方式扩展出其他类型。

在本节中，我们将会讨论 Rune 中的数据类型，以及他们的特性。

## 类型检查

Rune 中的类型由其*项*来唯一标识，这个项的路径是一个 `::` 分隔的的标识符，例如 `std::f64`，这个项标识了一个 64 位浮点数类型。

Rune 的类型可以在运行时通过 `is` 和 `is not` 关键字执行基本类型检查，如下所示：

```rust
#[test]
fn types() {
    assert!(() is Tuple, "tuples should be tuples");
    assert!((1, 2) is Tuple, "tuples should be tuples");
    assert!(true is bool, "bools should be bools");
    assert!('a' is char, "chars should be chars");
    assert!(b'a' is u8, "bytes should be bytes");
    assert!(42 is i64, "integers should be integers");
    assert!(42.1 is f64, "floats should be floats");
    assert!("hello" is String, "strings should be strings");
    assert!("x" is not char, "strings are not chars");
    assert!(#{"hello": "world"} is Object, "objects should be objects");
    assert!(["hello", "world"] is Vec, "vectors should be vectors");
}
```

相反，如果你提供的值不属于该类型，那么类型检查会失败：

```rust
pub fn main() {
    assert!(["hello", "world"] is String, "vectors should be strings");
}
```

```
$ ret2script scripts/types/bad_type_check.rx
== ! (panicked `assertion failed: vectors should be strings` (at 12)) (133.3µs)
error: virtual machine error
  ┌─ scripts/types/bad_type_check.rx:2:5
  │
2 │     assert!(["hello", "world"] is String, "vectors should be strings");
  │     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ panicked `assertion failed: vectors should be strings`
```

这使得我们能够在运行时了解值是哪种类型，并在脚本中根据值的类型做出决策。

```rust
fn dynamic_type(n) {
    if n is String {
        "n is a String"
    } else if n is Vec {
        "n is a vector"
    } else {
        "n is unknown"
    }
}

pub fn main() {
    println(dynamic_type("Hello"));
    println(dynamic_type([1, 2, 3, 4]));
    println(dynamic_type(42));
}
```

```
$ ret2script scripts/types/type_check.rx
n is a String
n is a vector
n is unknown
```

实现这一功能的更好方法是使用[模式匹配](/docs/rune/concepts/pattern-matching)，这是一种更加适合复杂条件分支的语法，在处理枚举中的不同变体时非常有用。

```rust
fn dynamic_type(n) {
    match n {
        n if n is String => "n is a String",
        n if n is Vec => "n is a vector",
        _ => "n is unknown",
    }
}

pub fn main() {
    println(dynamic_type("Hello"));
    println(dynamic_type([1, 2, 3, 4]));
    println(dynamic_type(42));
}
```

```
$ ret2script scripts/types/type_check_patterns.rx
n is a String
n is a vector
n is unknown
```
