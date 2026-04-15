import test from 'node:test';
import assert from 'node:assert/strict';
import { getOwnClientCpf, getResponsibleCpf, normalizeClientCpfFields } from '../utils/clientDocument.js';

test('aluno usa apenas parentCpf como documento do responsavel', () => {
  const student = {
    type: 'ALUNO',
    cpf: '12345678901',
    parentCpf: '99988877766',
  };

  assert.equal(getOwnClientCpf(student), '');
  assert.equal(getResponsibleCpf(student), '99988877766');
});

test('responsavel e colaborador preservam cpf proprio', () => {
  const responsible = {
    type: 'RESPONSAVEL',
    cpf: '123.456.789-01',
  };

  assert.equal(getOwnClientCpf(responsible), '12345678901');
  assert.equal(getResponsibleCpf(responsible), '12345678901');
});

test('normalizacao limpa cpf de aluno legado e mantem parentCpf', () => {
  const normalized = normalizeClientCpfFields({
    type: 'ALUNO',
    cpf: '123.456.789-01',
    parentCpf: '999.888.777-66',
  });

  assert.equal(normalized.cpf, '');
  assert.equal(normalized.parentCpf, '99988877766');
});
