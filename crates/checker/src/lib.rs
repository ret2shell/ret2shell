use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use r2s_bucket::challenge::ChallengeBucket;
use r2s_database::{submission, team, user};
use rune::{
    alloc,
    runtime::{Object, RuntimeContext},
    Source, Sources, Unit, Vm,
};
use traits::CheckerError;

mod modules;

pub mod traits;

#[derive(Clone, Debug)]
pub struct Checker {
    contexts: HashMap<String, (Arc<Unit>, Arc<RuntimeContext>, DateTime<Utc>)>,
}

macro_rules! to_rune_object {
    ($model:tt, $($column:tt), *) => {
        {
            let mut object = Object::new();
            $(
                object.insert(alloc::String::try_from(stringify!($column))?, rune::to_value($model.$column)?)?;
            )*
            object
        }
    };
}

impl Checker {
    pub async fn preload(&mut self, bucket: ChallengeBucket) -> Result<(), CheckerError> {
        let script_folder = bucket.path().to_path_buf().join("checker");
        if !script_folder.exists() {
            Err(CheckerError::MissingCheckerScript(format!(
                "{}: {}",
                bucket.name,
                script_folder.display()
            )))
        } else {
            let key = bucket.path().to_path_buf().display().to_string();
            if self.contexts.contains_key(key.as_str()) {
                return Ok(());
            }
            let mut context = rune_modules::default_context()?;
            context.install(rune_modules::http::module(true)?)?;
            context.install(rune_modules::json::module(true)?)?;
            context.install(rune_modules::toml::module(true)?)?;
            context.install(rune_modules::process::module(true)?)?;
            context.install(rune_modules::rand::module(true)?)?;
            let mut sources = Sources::new();
            sources.insert(Source::from_path(script_folder.join("main.rx"))?)?;

            let unit = rune::prepare(&mut sources).with_context(&context).build()?;
            let runtime = context.runtime()?;

            self.contexts.insert(
                bucket.name.clone(),
                (Arc::new(unit), Arc::new(runtime), Utc::now()),
            );
            Ok(())
        }
    }

    pub async fn check(
        &self, bucket: ChallengeBucket, user: user::Model, team: Option<team::Model>,
        submission: submission::Model,
    ) -> Result<(bool, String), CheckerError> {
        let (unit, runtime, _) = self
            .contexts
            .get(bucket.name.as_str())
            .ok_or(CheckerError::MissingCheckerScript(bucket.name.clone()))?;
        let mut vm = Vm::new(runtime.clone(), unit.clone());
        let user_object = to_rune_object!(user, id, account, institute_id);
        let submission_object =
            to_rune_object!(submission, id, user_id, team_id, challenge_id, content);
        let team_object = match team {
            Some(team) => to_rune_object!(team, id, name, institute_id),
            None => Object::new(),
        };
        let bucket_path =
            alloc::String::try_from(bucket.path().to_path_buf().display().to_string())?;
        let output = vm.call(
            ["check"],
            (bucket_path, user_object, team_object, submission_object),
        )?;
        let (result, message): (bool, String) = rune::from_value(output)?;
        Ok((result, message))
    }

    pub async fn environ(
        &self, bucket: ChallengeBucket, user: user::Model, team: Option<team::Model>,
    ) -> Result<HashMap<String, String>, CheckerError> {
        let (unit, runtime, _) = self
            .contexts
            .get(bucket.name.as_str())
            .ok_or(CheckerError::MissingCheckerScript(bucket.name.clone()))?;
        let mut vm = Vm::new(runtime.clone(), unit.clone());
        let user_object = to_rune_object!(user, id, account, institute_id);
        let team_object = match team {
            Some(team) => to_rune_object!(team, id, name, institute_id),
            None => Object::new(),
        };
        let bucket_path =
            alloc::String::try_from(bucket.path().to_path_buf().display().to_string())?;
        let output = vm.call(["environ"], (bucket_path, user_object, team_object))?;
        let object: Object = rune::from_value(output)?;
        let mut environ = HashMap::new();
        for (key, value) in object.iter() {
            environ.insert(key.to_string(), rune::from_value(value.clone())?);
        }
        Ok(environ)
    }

    pub async fn cleanup(&mut self) {
        let now = Utc::now();
        self.contexts.retain(|_, (_, _, time)| {
            let duration = now.signed_duration_since(*time);
            duration.num_hours() < 1
        });
    }
}
