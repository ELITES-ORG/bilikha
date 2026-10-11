import { describe, expect, it } from 'vitest';
import { ID_TYPES } from '../../../../backend/src/modules/verification/id-types';
import { ID_TYPE_OPTIONS } from './id-types';

/**
 * The API refuses a card without its back and a certificate with one, so the
 * ID step must ask for exactly the sides the API expects. Contracts hold types
 * only (ADR 0037), so each side keeps its own list; this fails when they drift.
 */
describe('ID types: the ID step and the API agree', () => {
  it('on which IDs are accepted', () => {
    expect(ID_TYPE_OPTIONS.map((option) => option.id).sort()).toEqual(Object.keys(ID_TYPES).sort());
  });

  it('on which of them have a back', () => {
    for (const option of ID_TYPE_OPTIONS) {
      expect({ id: option.id, hasBack: option.hasBack }).toEqual({
        id: option.id,
        hasBack: ID_TYPES[option.id].hasBack,
      });
    }
  });
});
