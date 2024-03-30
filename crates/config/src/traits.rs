pub trait Merge {
    fn merge(self, other: Self) -> Self;
}
