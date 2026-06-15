/**
 * Utilitários de validação para o cadastro financeiro.
 */

/**
 * Valida um CPF (Cadastro de Pessoas Físicas) de forma estrutural.
 */
export function validateCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  
  if (clean.length !== 11) return false;
  if (/^(\d)\1+$/.test(clean)) return false; // CPFs com todos os dígitos iguais (Ex: 111.111.111-11)

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

/**
 * Valida um CNPJ (Cadastro Nacional da Pessoa Jurídica) de forma estrutural.
 */
export function validateCNPJ(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, '');

  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  // Validação do primeiro dígito verificador
  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const d1 = clean.substring(size, size + 1);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let rev = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (rev !== parseInt(d1)) return false;

  // Validação do segundo dígito verificador
  size = size + 1;
  numbers = clean.substring(0, size);
  const d2 = clean.substring(size, size + 1);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  rev = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (rev !== parseInt(d2)) return false;

  return true;
}

/**
 * Valida se uma data de nascimento corresponde a maioridade (>= 18 anos).
 * Formato esperado: YYYY-MM-DD
 */
export function validateAge(birthDateStr: string): boolean {
  if (!birthDateStr) return false;
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age >= 18;
}

/**
 * Valida se o formato do telefone celular é aceitável (10 ou 11 dígitos numéricos).
 */
export function validatePhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  return clean.length === 10 || clean.length === 11;
}

/**
 * Valida se a chave Pix informada está no formato correto de acordo com seu tipo,
 * e verifica se corresponde ao documento cadastrado se o tipo for CPF ou CNPJ.
 */
export function validatePixKey(
  type: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP',
  key: string,
  registeredCpfCnpj: string
): boolean {
  const cleanKey = key.trim();
  const cleanCpfCnpj = registeredCpfCnpj.replace(/\D/g, '');

  switch (type) {
    case 'CPF': {
      const cleanPix = cleanKey.replace(/\D/g, '');
      if (cleanPix !== cleanCpfCnpj) return false;
      return validateCPF(cleanPix);
    }
    case 'CNPJ': {
      const cleanPix = cleanKey.replace(/\D/g, '');
      if (cleanPix !== cleanCpfCnpj) return false;
      return validateCNPJ(cleanPix);
    }
    case 'EMAIL': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(cleanKey);
    }
    case 'PHONE': {
      const cleanPix = cleanKey.replace(/\D/g, '');
      // Chave pix de telefone no Brasil geralmente começa com +55 (13 dígitos) ou sem prefixo nacional (11 dígitos)
      return cleanPix.length === 11 || (cleanPix.length === 13 && cleanPix.startsWith('55'));
    }
    case 'EVP': {
      // Chave aleatória (UUID v4 de 36 caracteres)
      const evpRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return evpRegex.test(cleanKey);
    }
    default:
      return false;
  }
}
