import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClient } from '../utils/validation.js';

test('aceita aluno com cpf espelhado do responsavel', () => {
  const result = validateClient({
    name: 'Aluno Teste',
    type: 'ALUNO',
    class: 'FUNDAMENTAL - 5 ANO',
    enterpriseId: 'ent-1',
    phone: '11999991111',
    parentWhatsapp: '11999991111',
    cpf: '12345678901',
    parentCpf: '12345678901',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('aceita aluno vinculado a colaborador com cpf apenas no responsavel', () => {
  const result = validateClient({
    name: 'Aluno Filho de Colaborador',
    type: 'ALUNO',
    class: 'FUNDAMENTAL - 5 ANO',
    enterpriseId: 'ent-1',
    responsibleCollaboratorId: 'col-1',
    parentName: 'Colaborador Responsavel',
    parentWhatsapp: '11999991111',
    parentCpf: '12345678901',
    cpf: '',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('ignora cpf invalido em aluno porque cpf pertence ao responsavel', () => {
  const result = validateClient({
    name: 'Aluno Sem CPF Proprio',
    type: 'ALUNO',
    class: 'FUNDAMENTAL - 5 ANO',
    enterpriseId: 'ent-1',
    cpf: '12345',
    parentCpf: '99988877766',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('mantem cpf invalido quando aluno informa cpf proprio incompleto', () => {
  const result = validateClient({
    name: 'Aluno Teste',
    type: 'COLABORADOR',
    class: 'FUNDAMENTAL - 5 ANO',
    enterpriseId: 'ent-1',
    cpf: '12345',
    parentCpf: '99988877766',
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CPF inválido'));
});
