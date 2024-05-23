use thiserror::Error;

#[derive(Error, Debug)]
pub enum CheckerError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Missing checker script: {0}")]
    MissingCheckerScript(String),
    #[error("Rune context error: {0}")]
    RuneError(#[from] rune::ContextError),
    #[error("Can not load script source: {0}")]
    SourceError(#[from] rune::source::FromPathError),
    #[error("Can not build script unit: {0}")]
    BuildError(#[from] rune::BuildError),
    #[error("Can not alloc script engine runtime: {0}")]
    AllocError(#[from] rune::alloc::Error),
    #[error("Executed script error: {0}")]
    ExecError(#[from] rune::runtime::VmError),
}
