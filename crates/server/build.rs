use std::{env, fs, path::Path};

fn main() {
  println!("cargo::rerun-if-env-changed=R2S_GIT_VERSION");
  let out_dir = env::var_os("OUT_DIR").unwrap();
  let dest_path = Path::new(&out_dir).join("constants.rs");
  let git_v = if env::var("R2S_GIT_VERSION").is_ok() {
    env::var("R2S_GIT_VERSION").unwrap().to_uppercase()
  } else {
    git_version::git_version!(
      args = ["--abbrev=8", "--always", "--dirty=*"],
      fallback = "unknown"
    )
    .to_uppercase()
  };
  let version = format!(
    "{}-{git_v}-{}",
    env!("CARGO_PKG_VERSION"),
    rustc_version::version().unwrap()
  );
  let full_version = format!(
    "{version}-{}-{}-{}",
    build_target::target_arch().unwrap(),
    build_target::target_os().unwrap(),
    build_target::target_env().unwrap(),
  );
  fs::write(
        dest_path,
        format!("pub const R2S_VERSION: &str = \"{version}\";\npub const R2S_FULL_VERSION: &str = \"{full_version}\";\n"),
    )
    .unwrap();
}
