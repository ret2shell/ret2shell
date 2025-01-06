use rune::{Any, ContextError, Module};
use serde::{Deserialize, Serialize};

use crate::traits::OAuthError;

#[rune::module(::ret2oauth::cas)]
pub fn module(_stdio: bool) -> Result<Module, ContextError> {
  let mut module = Module::from_meta(self::module_meta)?;

  module.ty::<IdsInfo>()?;
  module.ty::<OAuthError>()?;
  module.function_meta(get_info_from_yale_xml)?;

  Ok(module)
}

#[rune::function]
pub fn get_info_from_yale_xml(xml_response: &str) -> Result<IdsInfo, OAuthError> {
  get_info_from_yale_xml_impl(xml_response)
}

fn get_info_from_yale_xml_impl(xml_response: &str) -> Result<IdsInfo, OAuthError> {
  let doc = roxmltree::Document::parse(xml_response)?;
  let name_node = doc
    .descendants()
    .find(|node| node.tag_name().name() == "cn")
    .ok_or(OAuthError::MissingField("cn".to_owned()))?;
  let uid_node = doc
    .descendants()
    .find(|node| node.tag_name().name() == "user")
    .ok_or(OAuthError::MissingField("user".to_owned()))?;
  let name = name_node
    .text()
    .ok_or(OAuthError::MissingField("cn".to_owned()))?
    .to_owned();
  let uid = uid_node
    .text()
    .ok_or(OAuthError::MissingField("user".to_owned()))?
    .to_owned();
  Ok(IdsInfo { name, id: uid })
}

#[derive(Serialize, Deserialize, Debug, Clone, Any)]
#[rune(item = ::ret2oauth::cas)]
pub struct IdsInfo {
  pub id: String,
  pub name: String,
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_xml_parse() {
    let dx_xml = r#"
<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
    <cas:authenticationSuccess>
        <cas:user>1145141919810</cas:user>
        <cas:attributes>
            <cas:isFromNewLogin>true</cas:isFromNewLogin>
            <cas:authenticationDate>2023-04-29T09:29:17.370+08:00[GMT+08:00]</cas:authenticationDate>
            <cas:loginType>1</cas:loginType>
            <cas:successfulAuthenticationHandlers>com.wisedu.minos.config.login.RememberMeUsernamePasswordHandler</cas:successfulAuthenticationHandlers>
            <cas:cn>田所浩二</cas:cn>
            <cas:bindUserList>1145141919810</cas:bindUserList>
            <cas:userName>田所浩二</cas:userName>
            <cas:samlAuthenticationStatementAuthMethod>urn:oasis:names:tc:SAML:1.0:am:unspecified</cas:samlAuthenticationStatementAuthMethod>
            <cas:credentialType>MyRememberMeCaptchaCredential</cas:credentialType>
            <cas:uid>1145141919810</cas:uid>
            <cas:authenticationMethod>com.wisedu.minos.config.login.RememberMeUsernamePasswordHandler</cas:authenticationMethod>
            <cas:longTermAuthenticationRequestTokenUsed>false</cas:longTermAuthenticationRequestTokenUsed>
            <cas:cllt>userNameLogin</cas:cllt>
            <cas:dllt>generalLogin</cas:dllt>
            </cas:attributes>
    </cas:authenticationSuccess>
</cas:serviceResponse>
        "#;
    let info = get_info_from_yale_xml_impl(dx_xml).unwrap();
    assert_eq!(info.name, "田所浩二");
    assert_eq!(info.id, "1145141919810");
  }
}
