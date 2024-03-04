use base64::Engine;
use clap::{Parser, Subcommand};
use ring::{
    rand,
    signature::{self, KeyPair},
};

fn generate_keypair(output_path: &str) {
    let rng = rand::SystemRandom::new();
    let pks8_bytes = signature::Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
    std::fs::write(format!("{}/priv.bin", output_path), pks8_bytes.as_ref()).unwrap();
    let keypair = signature::Ed25519KeyPair::from_pkcs8(pks8_bytes.as_ref()).unwrap();
    std::fs::write(
        format!("{}/pub.bin", output_path),
        keypair.public_key().as_ref(),
    )
    .unwrap();
}

fn generate_new_key(ca: &str, path: &str, issuer: &str, website: &str, date: &str) {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").expect("Invalid date string");
    let ca_bytes = std::fs::read(ca).unwrap();
    let ca_keypair = signature::Ed25519KeyPair::from_pkcs8(ca_bytes.as_ref()).unwrap();
    let cert = serde_json::json!({
        "issuer": issuer,
        "website": website,
        "date": date,
    });
    let cert = serde_json::to_string(&cert).unwrap();
    let sig = ca_keypair.sign(cert.as_bytes());
    let cert = format!(
        "{}.{}",
        base64::engine::general_purpose::STANDARD.encode(cert),
        base64::engine::general_purpose::STANDARD.encode(sig.as_ref())
    );
    std::fs::write(format!("{}/license", path), cert.to_string()).unwrap();
}

/// Clap arg definition.
#[derive(Parser, Debug)]
#[command(
    author = "Reverier-Xu <reverier.xu@woooo.tech>",
    version,
    about = "Keygen for Ret 2 Shell Challenge API Platform",
    long_about = r#"
Keygen for Ret 2 Shell Challenge API Platform

THE CONTENTS OF THIS PROJECT ARE PROPRIETARY AND CONFIDENTIAL.
UNAUTHORIZED COPYING, TRANSFERRING OR REPRODUCTION OF THE CONTENTS OF THIS PROJECT,
VIA ANY MEDIUM IS STRICTLY PROHIBITED.

If you have any problems, please contact tech support <ret2shell@woooo.tech>.
    "#
)]
struct Args {
    #[command(subcommand)]
    command: Option<Commands>,
}

/// Clap subcommands.
#[derive(Subcommand, Debug)]
enum Commands {
    /// Run the server.
    Init {
        /// The path to the output file.
        #[arg(short, long)]
        path: String,
    },
    New {
        /// The path to the CA file.
        #[arg(short, long)]
        ca: String,
        /// The path to the output file.
        #[arg(short, long)]
        path: String,
        /// Issuer name.
        #[arg(short, long)]
        issuer: String,
        /// Issuer Website.
        #[arg(short, long)]
        website: String,
        /// Expiration date.
        #[arg(short, long)]
        date: String,
    },
}

fn main() {
    let args: Args = Args::parse();
    match args.command {
        Some(Commands::Init { path }) => generate_keypair(&path),
        Some(Commands::New {
            ca,
            path,
            issuer,
            website,
            date,
        }) => generate_new_key(&ca, &path, &issuer, &website, &date),
        None => {}
    }
}
