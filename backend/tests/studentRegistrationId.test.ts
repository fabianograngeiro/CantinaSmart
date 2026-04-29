import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUniqueStudentRegistrationId } from '../utils/studentRegistrationId.js';

test('mantem matricula preferida quando esta livre', () => {
  const registrationId = resolveUniqueStudentRegistrationId({
    candidate: { type: 'ALUNO', registrationId: 'A-200' },
    students: [
      { id: 's1', type: 'ALUNO', registrationId: '1001' },
      { id: 's2', type: 'ALUNO', registrationId: '1002' },
    ],
  });

  assert.equal(registrationId, 'A-200');
});

test('gera proxima matricula numerica quando preferida ja existe', () => {
  const registrationId = resolveUniqueStudentRegistrationId({
    candidate: { type: 'ALUNO', registrationId: '1002' },
    students: [
      { id: 's1', type: 'ALUNO', registrationId: '1001' },
      { id: 's2', type: 'ALUNO', registrationId: '1002' },
    ],
  });

  assert.equal(registrationId, '1003');
});

test('ignora o proprio aluno no update', () => {
  const registrationId = resolveUniqueStudentRegistrationId({
    candidate: { id: 's2', type: 'ALUNO', registrationId: '1002' },
    students: [
      { id: 's1', type: 'ALUNO', registrationId: '1001' },
      { id: 's2', type: 'ALUNO', registrationId: '1002' },
    ],
    ignoreClientId: 's2',
  });

  assert.equal(registrationId, '1002');
});

test('gera fallback a partir de 1000 quando nao ha matricula preferida', () => {
  const registrationId = resolveUniqueStudentRegistrationId({
    candidate: { type: 'ALUNO' },
    students: [],
  });

  assert.equal(registrationId, '1000');
});

test('nao altera cadastro que nao e aluno', () => {
  const registrationId = resolveUniqueStudentRegistrationId({
    candidate: { type: 'RESPONSAVEL', registrationId: 'R-1' },
    students: [{ id: 's1', type: 'ALUNO', registrationId: '1001' }],
  });

  assert.equal(registrationId, 'R-1');
});
