use r2s_config::captcha::ValidatorType;

#[tokio::main]
async fn main() {
    let captcha = r2s_captcha::generate(&ValidatorType::Image, &4)
        .await
        .unwrap();
    println!("{}", captcha.challenge);
}
