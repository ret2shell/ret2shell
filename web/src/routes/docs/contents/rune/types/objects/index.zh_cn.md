对象是匿名的映射类型，和 `JSON` 类似。

```rust
pub fn main() {
    let values = #{};
    values["first"] = "bar";
    values["second"] = 42;

    dbg(values["first"]);
    dbg(values.second); // items be accessed like struct fields.

    if let Some(key) = values.get("not a key") {
        dbg(key);
    } else {
        println("key did not exist");
    }

    for entry in values {
        dbg(entry);
    }
}
```

```
$ ret2script scripts/types/objects.rx
"bar"
42
key did not exist
("second", 42)
("first", "bar")
```

对象类型支持动态指定数据，在没有数据结构定义的时候非常有用。
