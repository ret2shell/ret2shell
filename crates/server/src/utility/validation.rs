//! Maps the errors reported by `validator` derives to response errors.
//!
//! Field-level validation rules live on the entity models themselves via
//! `validator` derive attributes (see `r2s_database`); request DTOs annotate
//! their fields the same way. This module only flattens the reported errors
//! into response errors.

use validator::{ValidationErrors, ValidationErrorsKind};

use crate::traits::ResponseError;

/// Flattens the errors reported by a `validator` derive into a deterministic,
/// human-readable message. Messages are sorted so that the text does not
/// depend on hash map iteration order.
pub fn flatten_validation_errors(errors: ValidationErrors) -> String {
  fn collect(errors: ValidationErrors, messages: &mut Vec<String>) {
    for (_, kind) in errors.into_errors() {
      match kind {
        ValidationErrorsKind::Field(field_errors) => messages.extend(
          field_errors
            .into_iter()
            .filter_map(|error| error.message.map(|message| message.into_owned())),
        ),
        ValidationErrorsKind::Struct(nested) => collect(*nested, messages),
        ValidationErrorsKind::List(list) => {
          for (_, nested) in list {
            collect(*nested, messages);
          }
        }
      }
    }
  }

  let mut messages = Vec::new();
  collect(errors, &mut messages);
  messages.sort();
  messages.join("; ")
}

pub fn validation_bad_request(errors: ValidationErrors) -> ResponseError {
  ResponseError::BadRequest(flatten_validation_errors(errors))
}
