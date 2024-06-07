你在前面的部分可能经常看到一些奇怪的字符串，它们看起来像这样 `` `Hello ${name}` ``，这称为模板字符串，这个语法允许你以一种更加方便的方式来格式化字符串。

> 你可能发现了！模板字符串是从 [ECMA Script](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals) 中借鉴而来的，相比 Rust 的字符串宏 `format!()`，模板字符串更加简洁易用。

```rust
pub fn main() {
    let age = 22;
    dbg(`I am ${age} years old!`);
}
```

```
$ ret2script scripts/template_literals/age.rx
"I am 22 years old!"
```

模板字符串由 Rune 的 VM 加速渲染，每个参数都使用*显示协议*，因此可以非常有效地构建复杂字符串。
