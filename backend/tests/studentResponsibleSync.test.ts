import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResponsiblePatchFromStudent,
  buildStudentParentPatchFromResponsible,
  hasStudentResponsibleFieldsChanged,
  isSameResponsibleReference,
} from '../utils/studentResponsibleSync.js';

test('detecta mudanca nos campos do responsavel do aluno', () => {
  const changed = hasStudentResponsibleFieldsChanged(
    { parentCpf: '111', parentEmail: 'old@mail.com' },
    { parentCpf: '222', parentEmail: 'old@mail.com' },
  );

  assert.equal(changed, true);
});

test('reconhece alunos do mesmo responsavel manual por cpf anterior', () => {
  const left = {
    type: 'ALUNO',
    enterpriseId: 'ent-1',
    parentName: 'Fabiano',
    parentCpf: '12345678901',
    parentWhatsapp: '11999998888',
  };
  const right = {
    type: 'ALUNO',
    enterpriseId: 'ent-1',
    parentName: 'Fabiano',
    parentCpf: '12345678901',
    parentWhatsapp: '11999998888',
  };

  assert.equal(isSameResponsibleReference(left, right), true);
});

test('monta patch para propagar dados do responsavel para alunos irmaos', () => {
  const patch = buildStudentParentPatchFromResponsible({
    parentName: 'Fabiano',
    parentRelationship: 'PAIS',
    parentWhatsappCountryCode: '55',
    parentWhatsapp: '(11) 98888-7777',
    parentEmail: 'resp@mail.com',
    parentCpf: '123.456.789-01',
  });

  assert.equal(patch.parentName, 'Fabiano');
  assert.equal(patch.parentWhatsapp, '11988887777');
  assert.equal(patch.parentCpf, '12345678901');
  assert.equal(patch.cpf, '');
});

test('monta patch para atualizar cadastro unico do responsavel', () => {
  const patch = buildResponsiblePatchFromStudent({
    parentName: 'Fabiano',
    parentRelationship: 'PAIS',
    parentWhatsappCountryCode: '55',
    parentWhatsapp: '(11) 98888-7777',
    parentEmail: 'resp@mail.com',
    parentCpf: '123.456.789-01',
  }, 'RESPONSAVEL');

  assert.equal(patch.name, 'Fabiano');
  assert.equal(patch.phone, '11988887777');
  assert.equal(patch.cpf, '12345678901');
  assert.equal('class' in patch ? patch.class : '', 'PAIS');
});
