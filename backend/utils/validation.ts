// Validation rules for clients
export function validateClient(client: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const normalizedType = String(client?.type || '').trim().toUpperCase();
  const normalizedName = String(client?.name || '').trim();
  const normalizedClass = String(client?.class || '').trim();
  const normalizedPhone = String(client?.phone || '').replace(/\D/g, '');

  // Name validation
  if (!client.name || typeof client.name !== 'string' || normalizedName.length === 0) {
    errors.push('Nome é obrigatório');
  } else if (normalizedName.length < 2) {
    errors.push('Nome deve ter pelo menos 2 caracteres');
  } else if (normalizedName.length > 255) {
    errors.push('Nome não pode ter mais de 255 caracteres');
  }

  // Type validation
  if (!client.type || typeof client.type !== 'string') {
    errors.push('Tipo é obrigatório');
  } else if (!['ALUNO', 'RESPONSAVEL', 'COLABORADOR', 'FORNECEDOR'].includes(normalizedType)) {
    errors.push('Tipo inválido');
  }

  // Enterprise ID validation
  if (!client.enterpriseId || typeof client.enterpriseId !== 'string') {
    errors.push('ID da empresa é obrigatório');
  }

  // Email validation (if provided)
  if (client.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(client.email)) {
      errors.push('Email inválido');
    }
  }

  // Phone validation (if provided)
  if (client.phone) {
    if (typeof client.phone !== 'string' || normalizedPhone.length < 10) {
      errors.push('Telefone inválido');
    }
  }

  if (normalizedType === 'ALUNO' && !normalizedClass) {
    errors.push('Turma é obrigatória para aluno');
  }

  // CPF validation (if provided)
  if (client.cpf) {
    if (typeof client.cpf !== 'string' || client.cpf.length < 11) {
      errors.push('CPF inválido');
    }
  }

  if (client.responsibleCollaboratorId !== undefined) {
    if (typeof client.responsibleCollaboratorId !== 'string') {
      errors.push('responsibleCollaboratorId inválido');
    }
  }

  if (client.relatedStudent !== undefined && client.relatedStudent !== null) {
    if (typeof client.relatedStudent !== 'object') {
      errors.push('relatedStudent inválido');
    } else if (!client.relatedStudent.name || String(client.relatedStudent.name).trim().length < 2) {
      errors.push('Nome do aluno relacionado é obrigatório');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Validate update data
export function validateClientUpdate(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Only validate fields that are being updated
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('Nome deve ser uma string não vazia');
    }
  }

  if (data.type !== undefined) {
    if (!['ALUNO', 'RESPONSAVEL', 'COLABORADOR', 'FORNECEDOR'].includes(data.type)) {
      errors.push('Tipo inválido');
    }
  }

  if (data.email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (String(data.email).trim().length > 0 && !emailRegex.test(data.email)) {
      errors.push('Email inválido');
    }
  }

  if (data.phone !== undefined) {
    if (typeof data.phone !== 'string') {
      errors.push('Telefone inválido');
    } else if (data.phone.trim().length > 0 && String(data.phone).replace(/\D/g, '').length < 10) {
      errors.push('Telefone inválido');
    }
  }

  if (data.responsibleCollaboratorId !== undefined && typeof data.responsibleCollaboratorId !== 'string') {
    errors.push('responsibleCollaboratorId inválido');
  }

  if (data.relatedStudent !== undefined && data.relatedStudent !== null) {
    if (typeof data.relatedStudent !== 'object') {
      errors.push('relatedStudent inválido');
    } else if (data.relatedStudent.name !== undefined && String(data.relatedStudent.name).trim().length < 2) {
      errors.push('Nome do aluno relacionado inválido');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  validateClient,
  validateClientUpdate,
};
