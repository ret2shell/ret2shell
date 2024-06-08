生成器是构造一个能够挂起自身状态的函数的便捷方法。

生成器最简单的用例是创建一个迭代器，其状态储存在生成器函数中，下面有一个高效生成斐波那契数列的例子：

```rust
fn fib() {
    let a = 0;
    let b = 1;

    loop {
        yield a;
        let c = a + b;
        a = b;
        b = c;
    }
}

pub fn main() {
    let g = fib();

    while let Some(n) = g.next() {
        println!("{}", n);

        if n > 100 {
            break;
        }
    }
}
```

```
$ ret2script scripts/generators/fibonacci.rx
0
1
1
2
3
5
8
13
21
34
55
89
144
```
