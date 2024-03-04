use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Email {
    pub name: String,
    pub email: String,
    pub subject: String,
    pub content: String,
}
