//! Prerequisite graph helpers shared by the web routes and the git push sync.
//!
//! Challenge ids are database-local, so the game bucket always refers to
//! challenges by their bucket names. These helpers convert between both
//! representations and validate that the prerequisite graph stays a directed
//! acyclic graph.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

/// Resolves prerequisite bucket names to challenge ids. Fails when a name is
/// unknown to the given mapping.
pub fn resolve_prerequisite_ids(
  bucket_to_id: &BTreeMap<String, i64>, prerequisites: &[String],
) -> Result<Vec<i64>, String> {
  prerequisites
    .iter()
    .map(|name| {
      bucket_to_id
        .get(name)
        .copied()
        .ok_or_else(|| format!("unknown challenge bucket `{name}` in prerequisites"))
    })
    .collect()
}

/// Sorts the given nodes so that every prerequisite appears before its
/// dependents. `graph` maps a node to the nodes it depends on; edges pointing
/// to nodes that are not keys of the graph (already existing challenges) are
/// treated as satisfied. Returns the nodes in dependency order, or a
/// description of a cycle when the graph is not a directed acyclic graph.
pub fn topological_sort(graph: &BTreeMap<String, BTreeSet<String>>) -> Result<Vec<String>, String> {
  let mut dependents: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
  let mut pending: BTreeMap<&str, usize> = BTreeMap::new();
  for (node, prerequisites) in graph {
    let node: &str = node.as_str();
    let pending_count = pending.entry(node).or_insert(0);
    for prerequisite in prerequisites {
      // prerequisites outside of the graph are already resolvable
      if !graph.contains_key(prerequisite) {
        continue;
      }
      dependents
        .entry(prerequisite.as_str())
        .or_default()
        .push(node);
      *pending_count += 1;
    }
  }

  let mut queue: VecDeque<&str> = pending
    .iter()
    .filter(|(_, count)| **count == 0)
    .map(|(&node, _)| node)
    .collect();
  let mut sorted = Vec::with_capacity(graph.len());
  while let Some(node) = queue.pop_front() {
    sorted.push(node.to_owned());
    for dependent in dependents.get(node).into_iter().flatten() {
      let count = pending
        .get_mut(dependent)
        .expect("dependent is a graph node");
      *count -= 1;
      if *count == 0 {
        queue.push_back(dependent);
      }
    }
  }

  if sorted.len() != graph.len() {
    let remaining: Vec<String> = pending
      .iter()
      .filter(|(_, count)| **count > 0)
      .map(|(&node, _)| node.to_owned())
      .collect();
    return Err(format!(
      "prerequisite graph contains a cycle involving: {}",
      remaining.join(", ")
    ));
  }
  Ok(sorted)
}

/// Finds a cycle in the given prerequisite graph (node -> prerequisite nodes)
/// and returns it rendered as a chain like `3 -> 4 -> 3`, if any.
pub fn find_cycle(graph: &BTreeMap<i64, Vec<i64>>) -> Option<String> {
  fn visit(
    node: i64, graph: &BTreeMap<i64, Vec<i64>>, state: &mut BTreeMap<i64, u8>, stack: &mut Vec<i64>,
  ) -> Option<Vec<i64>> {
    match state.get(&node) {
      Some(1) => {
        let start = stack.iter().position(|&n| n == node).unwrap_or(0);
        let mut cycle = stack[start..].to_vec();
        cycle.push(node);
        return Some(cycle);
      }
      Some(_) => return None,
      None => {}
    }
    state.insert(node, 1);
    stack.push(node);
    for &next in graph.get(&node).into_iter().flatten() {
      if let Some(cycle) = visit(next, graph, state, stack) {
        return Some(cycle);
      }
    }
    stack.pop();
    state.insert(node, 2);
    None
  }

  let mut nodes: Vec<i64> = graph.keys().copied().collect();
  for prerequisites in graph.values() {
    for &prerequisite in prerequisites {
      if !graph.contains_key(&prerequisite) && !nodes.contains(&prerequisite) {
        nodes.push(prerequisite);
      }
    }
  }

  let mut state: BTreeMap<i64, u8> = BTreeMap::new();
  let mut stack: Vec<i64> = Vec::new();
  for node in nodes {
    if let Some(cycle) = visit(node, graph, &mut state, &mut stack) {
      let chain = cycle
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(" -> ");
      return Some(chain);
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use std::collections::{BTreeMap, BTreeSet};

  use super::{find_cycle, resolve_prerequisite_ids, topological_sort};

  fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| (*s).to_owned()).collect()
  }

  #[test]
  fn topological_sort_orders_prerequisites_before_dependents() {
    let graph = BTreeMap::from([
      ("a".to_owned(), set(&["b", "c"])),
      ("b".to_owned(), set(&["c"])),
      ("c".to_owned(), set(&[])),
    ]);
    let sorted = topological_sort(&graph).unwrap();
    let position = |name: &str| sorted.iter().position(|n| n == name).unwrap();
    assert!(position("c") < position("b"));
    assert!(position("b") < position("a"));
  }

  #[test]
  fn topological_sort_treats_external_prerequisites_as_satisfied() {
    let graph = BTreeMap::from([("new".to_owned(), set(&["existing"]))]);
    let sorted = topological_sort(&graph).unwrap();
    assert_eq!(sorted, vec!["new".to_owned()]);
  }

  #[test]
  fn topological_sort_reports_cycles() {
    let graph = BTreeMap::from([
      ("a".to_owned(), set(&["b"])),
      ("b".to_owned(), set(&["c"])),
      ("c".to_owned(), set(&["a"])),
    ]);
    let error = topological_sort(&graph).unwrap_err();
    assert!(error.contains("cycle"), "unexpected error: {error}");
    for name in ["a", "b", "c"] {
      assert!(error.contains(name), "error should mention {name}: {error}");
    }
  }

  #[test]
  fn resolve_prerequisite_ids_maps_known_names_and_fails_unknown() {
    let mapping = BTreeMap::from([("a".to_owned(), 1), ("b".to_owned(), 2)]);
    let resolved = resolve_prerequisite_ids(&mapping, &["b".to_owned(), "a".to_owned()]).unwrap();
    assert_eq!(resolved, vec![2, 1]);
    assert!(resolve_prerequisite_ids(&mapping, &["missing".to_owned()]).is_err());
  }

  #[test]
  fn find_cycle_detects_self_reference_and_longer_cycles() {
    let self_reference = BTreeMap::from([(1, vec![1])]);
    assert_eq!(find_cycle(&self_reference).as_deref(), Some("1 -> 1"));

    let cycle = BTreeMap::from([(1, vec![2]), (2, vec![3]), (3, vec![1])]);
    assert!(find_cycle(&cycle).is_some());

    let acyclic = BTreeMap::from([(1, vec![2]), (2, vec![3]), (3, vec![])]);
    assert_eq!(find_cycle(&acyclic), None);
  }
}
