import { describe, expect, it } from 'vitest';
import {
  appealBody,
  appealProblem,
  changeBody,
  changeNeedsNumber,
  changeOptions,
  changeProblem,
  decisionBody,
  decisionProblem,
  withNumberChange,
  type DecisionDraft,
} from './id-review-logic';

const empty: DecisionDraft = { reason: '', idNumber: '', noIdNumber: false, acknowledgeMatch: false };

describe('what a decision needs before it is sent', () => {
  it('verify needs the number or the no-number box, and not both', () => {
    expect(decisionProblem('verify', empty)).toMatch(/ID number/);
    expect(decisionProblem('verify', { ...empty, idNumber: 'N01-23' })).toBeNull();
    expect(decisionProblem('verify', { ...empty, noIdNumber: true })).toBeNull();
    expect(decisionProblem('verify', { ...empty, idNumber: 'N01', noIdNumber: true })).toMatch(/not both/);
  });

  it('a decline needs the reason the person will see', () => {
    expect(decisionProblem('retry', empty)).toMatch(/reason/);
    expect(decisionProblem('retry', { ...empty, reason: '   ' })).toMatch(/reason/);
    expect(decisionProblem('retry', { ...empty, reason: 'Blurred.' })).toBeNull();
  });

  it('try again needs no number; not from Biliran does', () => {
    expect(decisionProblem('retry', { ...empty, reason: 'Glare.' })).toBeNull();
    expect(decisionProblem('final', { ...empty, reason: 'Outside Biliran.' })).toMatch(/ID number/);
    expect(decisionProblem('final', { ...empty, reason: 'Outside Biliran.', noIdNumber: true })).toBeNull();
  });

  it('verifying despite a match needs a reason', () => {
    const matched = { ...empty, idNumber: '1234', acknowledgeMatch: true };
    expect(decisionProblem('verify', matched)).toMatch(/despite/);
    expect(decisionProblem('verify', { ...matched, reason: 'Same household card.' })).toBeNull();
  });

  it('refuses a reason or a number past their limits', () => {
    expect(decisionProblem('retry', { ...empty, reason: 'x'.repeat(501) })).toMatch(/500/);
    expect(decisionProblem('verify', { ...empty, idNumber: '9'.repeat(65) })).toMatch(/longer/);
  });
});

describe('the decision body', () => {
  it('sends only what the decision uses, trimmed', () => {
    expect(decisionBody('verify', { ...empty, idNumber: ' 1234-5678 ' })).toEqual({
      decision: 'verify',
      idNumber: '1234-5678',
      expectedDecidedAt: null,
    });
    expect(decisionBody('final', { ...empty, reason: ' Outside. ', noIdNumber: true })).toEqual({
      decision: 'final',
      reason: 'Outside.',
      noIdNumber: true,
      expectedDecidedAt: null,
    });
  });

  it('never sends a number with try again', () => {
    expect(decisionBody('retry', { ...empty, reason: 'Blurred.', idNumber: '1234', noIdNumber: true })).toEqual({
      decision: 'retry',
      reason: 'Blurred.',
      expectedDecidedAt: null,
    });
  });

  it('acknowledges a match once it has been seen', () => {
    expect(
      decisionBody('verify', { ...empty, idNumber: '1234', reason: 'Same card.', acknowledgeMatch: true }),
    ).toEqual({
      decision: 'verify',
      idNumber: '1234',
      reason: 'Same card.',
      acknowledgeMatch: true,
      expectedDecidedAt: null,
    });
  });
});

describe('changing the number after a match', () => {
  const seen: DecisionDraft = { ...empty, idNumber: '1234', reason: 'Same card.', acknowledgeMatch: true };

  it('withdraws the acknowledgement, so the new number is checked on its own', () => {
    const changed = withNumberChange(seen, { idNumber: '5678' });
    expect(changed).toEqual({ ...seen, idNumber: '5678', acknowledgeMatch: false });
    expect(decisionBody('verify', changed)).not.toHaveProperty('acknowledgeMatch');
  });

  it('withdraws it for the no-number box too', () => {
    expect(withNumberChange(seen, { noIdNumber: true, idNumber: '' }).acknowledgeMatch).toBe(false);
  });
});

describe('changing a decision', () => {
  const none = { idNumberRecorded: false, idNumberAbsent: false };
  const recorded = { idNumberRecorded: true, idNumberAbsent: false };

  it('offers every decision but the current one', () => {
    expect(changeOptions('verified')).toEqual(['retry', 'final']);
    expect(changeOptions('declined_retry')).toEqual(['verify', 'final']);
    expect(changeOptions('declined_final')).toEqual(['verify', 'retry']);
  });

  it('always needs a reason', () => {
    expect(changeProblem('retry', empty, recorded)).toMatch(/why the decision is changing/);
    expect(changeProblem('retry', { ...empty, reason: 'Blurred after all.' }, recorded)).toBeNull();
  });

  it('asks for a number only when the row has none on record', () => {
    expect(changeNeedsNumber('verify', none)).toBe(true);
    expect(changeNeedsNumber('verify', recorded)).toBe(false);
    expect(changeNeedsNumber('final', { idNumberRecorded: false, idNumberAbsent: true })).toBe(false);
    expect(changeNeedsNumber('retry', none)).toBe(false);

    const reasoned = { ...empty, reason: 'Second look.' };
    expect(changeProblem('verify', reasoned, none)).toMatch(/ID number/);
    expect(changeProblem('verify', reasoned, recorded)).toBeNull();
    expect(changeProblem('verify', { ...reasoned, idNumber: '1', noIdNumber: true }, recorded)).toMatch(/not both/);
  });

  it('sends the reason, a number only when one was given, and the decision it changes', () => {
    const decidedAt = '2026-10-14T03:00:00.000Z';
    expect(changeBody('verify', { ...empty, reason: ' Second look. ' }, decidedAt)).toEqual({
      decision: 'verify',
      reason: 'Second look.',
      expectedDecidedAt: decidedAt,
    });
    expect(changeBody('final', { ...empty, reason: 'Ormoc.', idNumber: ' N01 ' }, decidedAt)).toEqual({
      decision: 'final',
      reason: 'Ormoc.',
      idNumber: 'N01',
      expectedDecidedAt: decidedAt,
    });
  });
});

describe('answering an appeal', () => {
  it('needs a reason either way, within the limit', () => {
    expect(appealProblem({ reason: '  ', acknowledgeMatch: false })).toMatch(/reason/);
    expect(appealProblem({ reason: 'x'.repeat(501), acknowledgeMatch: false })).toMatch(/500/);
    expect(appealProblem({ reason: 'The certificate shows Naval.', acknowledgeMatch: false })).toBeNull();
  });

  it('acknowledges a match only when granting', () => {
    const draft = { reason: ' Same household. ', acknowledgeMatch: true };
    expect(appealBody('grant', draft)).toEqual({ outcome: 'grant', reason: 'Same household.', acknowledgeMatch: true });
    expect(appealBody('uphold', draft)).toEqual({ outcome: 'uphold', reason: 'Same household.' });
  });
});
