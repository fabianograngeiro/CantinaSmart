import React from 'react';
import { ResponsibleTarget } from './types';

type WhatsAppPreviewProps = {
  template: string;
  selectedResponsible: ResponsibleTarget | null;
};

const fillTemplate = (template: string, responsible: ResponsibleTarget | null) => {
  const fallbackName = 'Responsável';
  const fullName = responsible?.name || fallbackName;
  const firstName = fullName.trim().split(/\s+/).filter(Boolean)[0] || fallbackName;
  const alunos = responsible?.students.map((item) => item.name).filter(Boolean).join(', ') || 'Aluno';
  const date = new Date().toLocaleDateString('pt-BR');

  return String(template || '')
    .replace(/\{\{\s*nome\s*\}\}/gi, fullName)
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, firstName)
    .replace(/\{\{\s*alunos\s*\}\}/gi, alunos)
    .replace(/\{\{\s*data\s*\}\}/gi, date);
};

const WhatsAppPreview: React.FC<WhatsAppPreviewProps> = ({ template, selectedResponsible }) => {
  const text = fillTemplate(template, selectedResponsible) || 'Digite uma mensagem para visualizar aqui...';

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900">
      <div className="bg-emerald-700 px-4 py-3 text-white">
        <p className="text-sm font-black">{selectedResponsible?.name || 'Contato (preview)'}</p>
        <p className="text-[11px] font-semibold text-emerald-100">online</p>
      </div>
      <div className="p-4 min-h-[320px] bg-[#efe4dc] dark:bg-zinc-800">
        <div className="ml-auto max-w-[92%] rounded-2xl bg-[#dcf8c6] dark:bg-emerald-900/40 px-4 py-3 shadow-sm border border-emerald-200 dark:border-emerald-700/40">
          <p className="text-sm font-medium text-slate-800 dark:text-zinc-100 whitespace-pre-wrap">{text}</p>
          <p className="mt-1 text-[10px] text-right text-slate-500 dark:text-zinc-400">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppPreview;
