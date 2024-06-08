我们在之前的章节里介绍过 [函数](/docs/rune/concepts/functions)，在 Rune 中还支持能够捕获当前环境的匿名函数，这种函数称为闭包。

## 函数指针

每个函数都可以通过引用其名称来获取一个函数指针，这允许你实现一些奇特的功能，例如将某个函数作为另一个函数使用的参数。

```rust
fn do_thing(op) {
    op(1, 2)
}

fn add(a, b) {
    a + b
}

fn sub(a, b) {
    a - b
}

#[test]
fn test_function_pointer() {
    assert_eq!(do_thing(add), 3);
    assert_eq!(do_thing(sub), -1);
}

pub fn main() {
    println(`Result: {do_thing(add)}`);
    println(`Result: {do_thing(sub)}`);
}
```

```
$ ret2script scripts/closures/function_pointer.rx
Result: 3
Result: -1
```

## 闭包

Rune 中闭包的语法尽可能地与 Rust 保持了相似的行为与语法，这使得你可以在 Rune 中使用闭包来实现一些复杂的功能。

```rust
fn work(op) {
    op(1, 2)
}

#[test]
fn test_basic_closure() {
    let n = 1;
    assert_eq!(work(|a, b| n + a + b), 4);
    assert_eq!(work(|a, b| n + a * b), 3);
}

pub fn main() {
    let n = 1;
    println!("Result: {}", work(|a, b| n + a + b));
    println!("Result: {}", work(|a, b| n + a * b));
}
```

```
$ ret2script scripts/closures/basic_closure.rx
Result: 4
Result: 3
```
