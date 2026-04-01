import { type FieldValues, type FormStore, getValues, reset } from "@modular-forms/solid";
import { makePersisted } from "@solid-primitives/storage";
import { type Accessor, createEffect, createMemo, createRoot, createSignal, untrack } from "solid-js";

type DraftScalar = boolean | number | string | null | undefined;
type DraftNode = DraftScalar | DraftNode[] | { [key: string]: DraftNode };

const [formDraftStore, setFormDraftStore] = createRoot(() =>
  makePersisted(createSignal<Record<string, DraftNode>>({}), { name: "form-draft" })
);

function isPlainObject(value: unknown): value is Record<string, DraftNode> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneDraftNode<T extends DraftNode>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneDraftNode(item)) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDraftNode(item)])) as T;
  }
  return value;
}

function isEqualDraftNode(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => isEqualDraftNode(item, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key) => key in right && isEqualDraftNode(left[key], right[key]));
  }

  return false;
}

function createDraftDiff(remote: unknown, current: unknown): DraftNode | undefined {
  if (Array.isArray(remote) || Array.isArray(current)) {
    return isEqualDraftNode(remote, current) ? undefined : cloneDraftNode(current as DraftNode);
  }

  if (isPlainObject(remote) || isPlainObject(current)) {
    const remoteObject = isPlainObject(remote) ? remote : {};
    const currentObject = isPlainObject(current) ? current : {};
    const diff: Record<string, DraftNode> = {};

    for (const key of new Set([...Object.keys(remoteObject), ...Object.keys(currentObject)])) {
      const next = createDraftDiff(remoteObject[key], currentObject[key]);
      if (next !== undefined) diff[key] = next;
    }

    return Object.keys(diff).length > 0 ? diff : undefined;
  }

  return isEqualDraftNode(remote, current) ? undefined : cloneDraftNode(current as DraftNode);
}

function mergeDraftNode(remote: unknown, draft: unknown): DraftNode {
  if (draft === undefined) {
    return cloneDraftNode(remote as DraftNode);
  }

  if (Array.isArray(remote) || Array.isArray(draft)) {
    return cloneDraftNode(draft as DraftNode);
  }

  if (isPlainObject(remote) || isPlainObject(draft)) {
    const merged = isPlainObject(remote) ? cloneDraftNode(remote) : {};

    if (!isPlainObject(draft)) {
      return merged;
    }

    for (const [key, value] of Object.entries(draft)) {
      merged[key] = mergeDraftNode(merged[key], value);
    }

    return merged;
  }

  return cloneDraftNode(draft as DraftNode);
}

function getCurrentDraftNode(key?: string) {
  if (!key) return undefined;
  return formDraftStore()[key];
}

export function buildFormDraftKey(...parts: Array<string | number | false | null | undefined>) {
  const key = parts
    .map((part) => {
      if (part === false || part === null || part === undefined) return "";
      return String(part).trim();
    })
    .filter(Boolean)
    .join("/");

  return key || undefined;
}

export function getFormDraft<Values extends FieldValues>(key?: string) {
  const draft = getCurrentDraftNode(key);
  return draft ? (cloneDraftNode(draft) as Partial<Values>) : undefined;
}

export function hasFormDraft(key?: string) {
  return getCurrentDraftNode(key) !== undefined;
}

export function setFormDraft<Values extends FieldValues>(key: string, draft?: Partial<Values>) {
  setFormDraftStore((current) => {
    const next = { ...current };
    const value = draft ? (cloneDraftNode(draft as DraftNode) as DraftNode | undefined) : undefined;

    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }

    return next;
  });
}

export function clearFormDraft(key?: string) {
  if (!key) return;

  setFormDraftStore((current) => {
    if (!(key in current)) return current;

    const next = { ...current };
    delete next[key];
    return next;
  });
}

export function resetFormDraftStore() {
  setFormDraftStore({});
}

export function mergeFormDraft<Values extends FieldValues>(remoteValues: Values, draft?: Partial<Values>) {
  return mergeDraftNode(remoteValues, draft) as Values;
}

export function useFormDraft<Values extends FieldValues>(options: {
  form: FormStore<Values>;
  key: Accessor<string | undefined>;
  remoteValues: Accessor<Values>;
  enabled?: Accessor<boolean>;
}) {
  const key = createMemo(() => options.key());
  const enabled = createMemo(() => !!key() && (options.enabled?.() ?? true));
  const [hydratedKey, setHydratedKey] = createSignal<string | undefined>();

  const draft = createMemo(() => {
    const currentKey = key();
    if (!currentKey) return undefined;
    const currentDraft = formDraftStore()[currentKey];
    return currentDraft ? (cloneDraftNode(currentDraft) as Partial<Values>) : undefined;
  });

  const hasDraft = createMemo(() => {
    const currentKey = key();
    if (!currentKey) return false;
    return formDraftStore()[currentKey] !== undefined;
  });

  createEffect(() => {
    const currentKey = key();
    if (hydratedKey() && hydratedKey() !== currentKey) {
      setHydratedKey(undefined);
    }
  });

  createEffect(() => {
    const currentKey = key();
    if (!currentKey || !enabled()) return;

    const mergedValues = mergeFormDraft(options.remoteValues(), draft());
    const currentValues = untrack(() => getValues(options.form, { shouldActive: false }) as Values);

    if (!isEqualDraftNode(currentValues, mergedValues)) {
      untrack(() => {
        reset(options.form, {
          initialValues: mergedValues,
          keepResponse: true,
          keepSubmitCount: true,
          keepSubmitted: true,
        });
      });
    }

    setHydratedKey(currentKey);
  });

  createEffect(() => {
    const currentKey = key();
    if (!currentKey || !enabled() || hydratedKey() !== currentKey) return;

    const nextDraft = createDraftDiff(
      options.remoteValues(),
      getValues(options.form, { shouldActive: false }) as Values
    ) as Partial<Values> | undefined;

    if (isEqualDraftNode(draft(), nextDraft)) return;
    setFormDraft(currentKey, nextDraft);
  });

  return {
    hasDraft,
    draft,
    discardDraft: () => clearFormDraft(key()),
  };
}
