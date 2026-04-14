import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCheckDuplicateStudentOnUpdate } from '../utils/clientDuplicateRules.js';

const baseStudent = {
  id: 'student-1',
  enterpriseId: 'ent-1',
  type: 'ALUNO',
  name: 'Maria Silva',
  registrationId: '1023',
  phone: '(11) 98888-7777',
  cpf: '123.456.789-00',
};

test('nao valida duplicidade em update financeiro de aluno', () => {
  const shouldCheck = shouldCheckDuplicateStudentOnUpdate(baseStudent, {
    balance: -20,
    spentToday: 35,
    monthlyConsumption: 100,
  });

  assert.equal(shouldCheck, false);
});

test('nao valida duplicidade quando telefone enviado e equivalente apos normalizacao', () => {
  const shouldCheck = shouldCheckDuplicateStudentOnUpdate(baseStudent, {
    phone: '11988887777',
  });

  assert.equal(shouldCheck, false);
});

test('valida duplicidade quando telefone do aluno muda de fato', () => {
  const shouldCheck = shouldCheckDuplicateStudentOnUpdate(baseStudent, {
    phone: '(11) 97777-6666',
  });

  assert.equal(shouldCheck, true);
});

test('valida duplicidade quando tipo passa a ALUNO', () => {
  const collaborator = {
    id: 'collab-1',
    enterpriseId: 'ent-1',
    type: 'COLABORADOR',
    name: 'Joao Pereira',
  };

  const shouldCheck = shouldCheckDuplicateStudentOnUpdate(collaborator, {
    type: 'ALUNO',
  });

  assert.equal(shouldCheck, true);
});

test('valida duplicidade quando enterprise do aluno muda', () => {
  const shouldCheck = shouldCheckDuplicateStudentOnUpdate(baseStudent, {
    enterpriseId: 'ent-2',
  });

  assert.equal(shouldCheck, true);
});

test('nao valida duplicidade para colaborador sem troca para ALUNO', () => {
  const collaborator = {
    id: 'collab-2',
    enterpriseId: 'ent-1',
    type: 'COLABORADOR',
    name: 'Carlos',
    phone: '(11) 96666-5555',
  };

  const shouldCheck = shouldCheckDuplicateStudentOnUpdate(collaborator, {
    phone: '(11) 95555-4444',
  });

  assert.equal(shouldCheck, false);
});
