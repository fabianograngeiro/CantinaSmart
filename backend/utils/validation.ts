// Validation rules for clients
export function validateClient(client: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Name validation
  if (!client.name || typeof client.name !== 'string' || client.name.trim().length === 0) {
    errors.push('Nome é obrigatório');
  } else if (client.name.length < 2) {
    errors.push('Nome deve ter pelo menos 2 caracteres');
  } else if (client.name.length > 255) {
    errors.push('Nome não pode ter mais de 255 caracteres');
  }

  // Type validation
  if (!client.type || typeof client.type !== 'string') {
    errors.push('Tipo é obrigatório');
  } else if (!['ALUNO', 'RESPONSAVEL', 'COLABORADOR', 'FORNECEDOR'].includes(client.type)) {
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
    if (typeof client.phone !== 'string' || client.phone.length < 10) {
      errors.push('Telefone inválido');
    }
  }

  // CPF validation (if provided)
  if (client.cpf) {
    if (typeof client.cpf !== 'string' || client.cpf.length < 11) {
      errors.push('CPF inválido');
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
    if (!emailRegex.test(data.email)) {
      errors.push('Email inválido');
    }
  }

  if (data.phone !== undefined) {
    if (typeof data.phone !== 'string' || data.phone.length < 10) {
      errors.push('Telefone inválido');
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
