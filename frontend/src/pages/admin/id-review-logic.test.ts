import { describe, expect, it } from 'vitest';
import { decisionBody, decisionProblem, withNumberChange, type DecisionDraft } from './id-review-logic';

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
    });
    expect(decisionBody('final', { ...empty, reason: ' Outside. ', noIdNumber: true })).toEqual({
      decision: 'final',
      reason: 'Outside.',
      noIdNumber: true,
    });
  });

  it('never sends a number with try again', () => {
    expect(decisionBody('retry', { ...empty, reason: 'Blurred.', idNumber: '1234', noIdNumber: true })).toEqual({
      decision: 'retry',
      reason: 'Blurred.',
    });
  });

  it('acknowledges a match once it has been seen', () => {
    expect(
      decisionBody('verify', { ...empty, idNumber: '1234', reason: 'Same card.', acknowledgeMatch: true }),
    ).toEqual({ decision: 'verify', idNumber: '1234', reason: 'Same card.', acknowledgeMatch: true });
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
