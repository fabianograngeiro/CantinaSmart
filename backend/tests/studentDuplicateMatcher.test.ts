import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStudentDuplicateReason } from '../utils/studentDuplicateMatcher.js';

test('permite alunos diferentes com mesmo parentWhatsapp', () => {
  const candidate = {
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'A-200',
    parentWhatsapp: '(11) 99999-1111',
    phone: '',
  };

  const existing = {
    id: 'student-1',
    type: 'ALUNO',
    name: 'BRUNO SOUZA',
    registrationId: 'B-300',
    parentWhatsapp: '(11) 99999-1111',
    phone: '',
  };

  const reason = detectStudentDuplicateReason({ candidate, existing });
  assert.equal(reason, null);
});

test('detecta duplicidade por telefone quando phone do aluno e igual', () => {
  const candidate = {
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'A-200',
    phone: '(11) 98888-7777',
  };

  const existing = {
    id: 'student-1',
    type: 'ALUNO',
    name: 'ANA SOUZA 2',
    registrationId: 'B-300',
    phone: '11988887777',
  };

  const reason = detectStudentDuplicateReason({ candidate, existing });
  assert.equal(reason, 'Telefone');
});
