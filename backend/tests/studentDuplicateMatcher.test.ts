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

test('ignora telefone e cpf espelhados do responsavel ao comparar alunos', () => {
  const candidate = {
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'A-200',
    parentWhatsapp: '(11) 99999-1111',
    phone: '(11) 99999-1111',
    parentCpf: '123.456.789-01',
    cpf: '123.456.789-01',
  };

  const existing = {
    id: 'student-1',
    type: 'ALUNO',
    name: 'BRUNO SOUZA',
    registrationId: 'B-300',
    parentWhatsapp: '(11) 99999-1111',
    phone: '(11) 99999-1111',
    parentCpf: '12345678901',
    cpf: '12345678901',
  };

  const reason = detectStudentDuplicateReason({ candidate, existing });
  assert.equal(reason, null);
});

test('ignora cpf do colaborador responsavel ao comparar alunos vinculados', () => {
  const candidate = {
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'A-200',
    responsibleCollaboratorId: 'col-1',
    parentCpf: '123.456.789-01',
    cpf: '',
  };

  const existing = {
    id: 'student-1',
    type: 'ALUNO',
    name: 'BRUNO SOUZA',
    registrationId: 'B-300',
    responsibleCollaboratorId: 'col-1',
    parentCpf: '12345678901',
    cpf: '',
  };

  const reason = detectStudentDuplicateReason({ candidate, existing });
  assert.equal(reason, null);
});

test('para o mesmo responsavel bloqueia apenas nome completo repetido', () => {
  const candidate = {
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'A-200',
    responsibleClientId: 'resp-1',
    parentCpf: '12345678901',
  };

  const existing = {
    id: 'student-1',
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'B-300',
    responsibleClientId: 'resp-1',
    parentCpf: '12345678901',
  };

  const reason = detectStudentDuplicateReason({ candidate, existing });
  assert.equal(reason, 'Nome completo');
});

test('para o mesmo responsavel ignora matricula repetida quando nome e diferente', () => {
  const candidate = {
    type: 'ALUNO',
    name: 'ANA SOUZA',
    registrationId: 'A-200',
    responsibleClientId: 'resp-1',
    parentCpf: '12345678901',
  };

  const existing = {
    id: 'student-1',
    type: 'ALUNO',
    name: 'BRUNO SOUZA',
    registrationId: 'A-200',
    responsibleClientId: 'resp-1',
    parentCpf: '12345678901',
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
