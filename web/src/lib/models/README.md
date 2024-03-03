# API Models

This module contains the models that are synced with backend API.

Note that the entity model defined in the backend do not contains some columns, which are marked as optionally undefined.

```typescript
export type SampleModel = {
  // the column exists in the database
  id: number
  // the column exists in the database, but could be null
  name: string | null
  // the column does not exist in the database, but backend could join multiple tables to get the value
  user_name?: string
}
```

You can distinct the field whether `null` or `undefined` to see if you use the wrong API. If you want to use some fields that are marked as `undefined`, the correct API will always return a value for that field. The column will be marked as `null` only if the column is nullable in the database, you can't get it from any APIs.
