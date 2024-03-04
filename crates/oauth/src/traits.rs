use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OAuthKey {
    pub id: String,
    pub key: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OAuthKeys {
    pub github: Option<OAuthKey>,
    pub gitlab: Option<OAuthKey>,
    pub google: Option<OAuthKey>,
    pub xdu: Option<OAuthKey>,
    pub qq: Option<OAuthKey>,
}
