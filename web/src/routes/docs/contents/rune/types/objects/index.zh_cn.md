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

```rust
async fn get_commits(repo, limit) {
    let limit = limit.unwrap_or(10);

    let client = http::Client::new();
    let request = client.get(`https://api.github.com/repos/${repo}/commits`);
    let response = request.header("User-Agent", "Ret2Shell").send().await?;
    let text = response.text().await?;
    let json = json::from_string(text)?;

    let commits = json.iter().take(limit).map(|e| e.sha).collect::<Vec>();
    Ok(commits)
}

pub async fn main() {
    for commit in get_commits("ret2shell/ret2script", Some(5)).await? {
        println(commit);
    }
}
```

```
$ ret2script scripts/types/json.rx
23b603ea52e600b0969537401f1a89fe976a7c22
```
