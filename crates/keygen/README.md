# Keygen

初始化：

```
r2s-keygen init --path ./config/
```

初始化完成之后需要重新使用 cargo build 编译 ret2shell 本体，这样新的公钥才会嵌入到二进制文件当中，用于后续的签名验证。

```
cargo build --release -p ret2shell
```

签发：

```
r2s-keygen new --ca ./config/priv.bin --path ./config/ --issuer <ISSUER> --website <WEBSITE> --date <ISO DATE>
```
