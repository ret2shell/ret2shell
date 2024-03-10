macro_rules! adapt_struct {
    ($original: expr) => {{
        let original_str = serde_json::to_value(&$original.clone())?;
        serde_json::from_value(original_str)?
    }};
}

pub(crate) use adapt_struct;
