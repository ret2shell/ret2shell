mod entities;

pub use entities::{
    article, audit, calendar, challenge, comment, config, extra, game, hint, instance, institute,
    ip, media, notification, oauth, policy, submission, team, user,
};
pub use sea_orm::DbErr;
