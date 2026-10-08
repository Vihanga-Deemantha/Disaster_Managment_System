/** One thing wrong with one field, as a machine code the screens translate (E1). */
export interface FieldIssue {
  field: string;
  code: string;
}

/** What `Warning.validate` returns (CD-03): pure data, never an exception. */
export interface ValidationResult {
  ok: boolean;
  errors: FieldIssue[];
}

export const validationResult = (errors: FieldIssue[]): ValidationResult => ({
  ok: errors.length === 0,
  errors,
});
