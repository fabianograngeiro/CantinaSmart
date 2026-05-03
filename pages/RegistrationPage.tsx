import React, { useState, useMemo, useEffect } from 'react';
import { 
  UserPlus, User, ShieldCheck, CheckCircle2,
  ArrowLeft, Copy, ArrowRight, UserCircle, MapPin,
  Plus, GraduationCap, Users, Lock, Clipboard, AlertCircle, X,
  Briefcase, Check
} from 'lucide-react';
import { Enterprise } from '../types';
import ApiService from '../services/api';

interface StudentEntry {
  tempId: string;
  name: string;
  class: string;
  grade: string;
  registrationId: string;
  photo: string;
}

// Lista de seeds otimizada para jovens/crianças, todos com expressão sorridente
const AVATAR_SEEDS = [
  { id: 'j1', seed: 'Felix' },
  { id: 'j2', seed: 'Aneka' },
  { id: 'j3', seed: 'Caleb' },
  { id: 'j4', seed: 'Jocelyn' },
  { id: 'j5', seed: 'Toby' },
  { id: 'j6', seed: 'Mia' },
  { id: 'j7', seed: 'Leo' },
  { id: 'j8', seed: 'Zoe' },
  { id: 'j9', seed: 'Max' },
  { id: 'j10', seed: 'Ava' },
];

const RegistrationPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [isFinished, setIsFinished] = useState(false);
  const [regType, setRegType] = useState<'ALUNO' | 'COLABORADOR' | null>(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);

  const [registeredStudents, setRegisteredStudents] = useState<StudentEntry[]>([]);

  const [guardianData, setGuardianData] = useState({
    type: 'PAI' as 'PAI' | 'MAE' | 'OUTRO',
    name: '',
    cpf: '',
    phone: '',
    email: '',
    enterpriseId: ''
  });

  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);

  // Carregar empresas da API
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const data = await ApiService.getEnterprises();
        setEnterprises(data);
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
        setEnterprises([]);
      }
    };
    loadEnterprises();
  }, []);

  const [currentStudent, setCurrentStudent] = useState<StudentEntry>({
    tempId: Math.random().toString(36).substr(2, 9),
    name: '',
    class: '',
    grade: '',
    registrationId: '',
    photo: `https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&mouth=smile&backgroundColor=b6e3f4,c0aede,d1d4f9` 
  });

  const selectedEnterprise = useMemo(() => 
    enterprises.find(e => e.id === guardianData.enterpriseId), 
  [guardianData.enterpriseId, enterprises]);

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const handleSaveAndAskNext = () => {
    if (!currentStudent.name || (regType === 'ALUNO' && (!guardianData.name || !guardianData.cpf))) {
        alert("Preencha todos os campos obrigatórios (*)");
        return;
    }
    
    const studentToSave = { ...currentStudent };
    
    setRegisteredStudents(prev => [...prev, studentToSave]);
    
    if (regType === 'ALUNO') {
      setShowDecisionModal(true);
    } else {
      localStorage.setItem('canteen_user_type', 'COLABORADOR');
      localStorage.setItem('canteen_registered_students', JSON.stringify([{ ...studentToSave, class: 'Staff' }]));
      setIsFinished(true);
    }
  };

  const handleAddAnother = () => {
    setCurrentStudent({
      tempId: Math.random().toString(36).substr(2, 9),
      name: '',
      class: '',
      grade: '',
      registrationId: '',
      photo: `https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&mouth=smile&backgroundColor=b6e3f4,c0aede,d1d4f9`
    });
    setShowDecisionModal(false);
  };

  const handleFinish = () => {
    localStorage.setItem('canteen_user_type', 'ALUNO');
    localStorage.setItem('canteen_registered_students', JSON.stringify(registeredStudents));
    localStorage.setItem('canteen_guardian_cpf', guardianData.cpf);
    localStorage.setItem('canteen_guardian_name', guardianData.name);
    
    setShowDecisionModal(false);
    setIsFinished(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copiado!`);
  };

  if (isFinished) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-['Inter']">
        <div className="w-full max-w-lg bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 border border-indigo-50">
           <div className="bg-emerald-600 p-10 text-white text-center space-y-4">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto shadow-inner ring-8 ring-white/10"><CheckCircle2 size={40} /></div>
              <h2 className="text-3xl font-black uppercase tracking-tight">Cadastro Concluído!</h2>
              <p className="text-emerald-100 text-sm font-medium">Os dados foram salvos com sucesso na unidade <b>{selectedEnterprise?.name}</b>.</p>
           </div>
           
           <div className="p-10 space-y-8">
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] text-center">Suas Credenciais de Acesso</h3>
                 <div className="grid grid-cols-1 gap-4">
                    <div className="bg-indigo-50 p-6 rounded-[32px] border-2 border-indigo-100 flex items-center justify-between group">
                       <div>
                          <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">Usuário (Seu CPF)</p>
                          <p className="text-xl font-black text-indigo-900">{guardianData.cpf || 'Acesse com seu CPF'}</p>
                       </div>
                       <button onClick={() => copyToClipboard(guardianData.cpf, 'CPF')} className="p-4 bg-white rounded-2xl text-indigo-600 shadow-sm hover:bg-indigo-600 hover:text-white transition-all active:scale-90"><Clipboard size={20}/></button>
                    </div>
                    <div className="bg-indigo-50 p-6 rounded-[32px] border-2 border-indigo-100 flex items-center justify-between group">
                       <div>
                          <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">Senha Padrão</p>
                          <p className="text-xl font-black text-indigo-900 tracking-[4px]">123456</p>
                       </div>
                       <button onClick={() => copyToClipboard('123456', 'Senha')} className="p-4 bg-white rounded-2xl text-indigo-600 shadow-sm hover:bg-indigo-600 hover:text-white transition-all active:scale-90"><Copy size={20}/></button>
                    </div>
                 </div>
              </div>

              <div className="bg-amber-50 p-6 rounded-[32px] border-2 border-amber-100 flex gap-4">
                 <AlertCircle className="text-amber-500 shrink-0" size={24} />
                 <p className="text-[11px] font-bold text-amber-800 leading-relaxed uppercase">
                    Por segurança, altere sua senha no primeiro acesso em: <br/>
                    <span className="font-black tracking-tight">CONFIGURAÇÕES {'->'} ALTERAR SENHA</span>
                 </p>
              </div>

              <button onClick={() => window.location.href = '#/portal'} className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95">
                 Acessar Portal do Cliente <ArrowRight size={20} />
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center py-10 px-4 scrollbar-hide font-['Inter']">
      <div className="w-full max-w-5xl bg-white rounded-[48px] shadow-2xl overflow-hidden flex flex-col relative border border-gray-100">
        
        <div className="bg-indigo-600 p-8 text-white shrink-0">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md border border-white/10"><UserPlus size={28} /></div>
                 <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase leading-none">Cadastro de Cliente</h1>
                    <p className="text-indigo-200 text-[10px] font-black uppercase tracking-[3px] opacity-80 mt-1">{selectedEnterprise?.name || 'Nova Matrícula'}</p>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                 {[1, 2, 3].map(i => (
                   <div key={i} className={`h-2 rounded-full transition-all duration-500 ${step >= i ? 'w-8 bg-white shadow-lg' : 'w-2 bg-white/20'}`}></div>
                 ))}
              </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide space-y-12">
           {step === 1 && (
             <div className="space-y-12 animate-in fade-in duration-500">
                <div className="text-center space-y-3">
                   <h2 className="text-4xl font-black text-gray-800 uppercase tracking-tight">Qual o perfil?</h2>
                   <p className="text-gray-400 font-medium max-w-md mx-auto">Escolha quem utilizará os serviços da cantina.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                   <button 
                    onClick={() => { setRegType('ALUNO'); nextStep(); }}
                    className={`group p-10 rounded-[40px] border-4 transition-all flex flex-col items-center gap-6 text-center hover:shadow-2xl ${regType === 'ALUNO' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-50 bg-gray-50/30 hover:border-indigo-200'}`}
                   >
                      <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform"><GraduationCap size={48} className="text-indigo-600" /></div>
                      <div>
                         <h3 className="text-xl font-black text-gray-800 uppercase">Aluno / Estudante</h3>
                         <p className="text-xs text-gray-400 mt-2 font-medium">Fluxo para responsáveis de alunos.</p>
                      </div>
                   </button>
                   <button 
                    onClick={() => { setRegType('COLABORADOR'); nextStep(); }}
                    className={`group p-10 rounded-[40px] border-4 transition-all flex flex-col items-center gap-6 text-center hover:shadow-2xl ${regType === 'COLABORADOR' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-50 bg-gray-50/30 hover:border-indigo-200'}`}
                   >
                      <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform"><Briefcase size={48} className="text-indigo-600" /></div>
                      <div>
                         <h3 className="text-xl font-black text-gray-800 uppercase">Colaborador / Staff</h3>
                         <p className="text-xs text-gray-400 mt-2 font-medium">Professores e funcionários da unidade.</p>
                      </div>
                   </button>
                </div>
             </div>
           )}

           {step === 2 && (
             <div className="space-y-8 animate-in slide-in-from-right-4">
                <div className="text-center space-y-2">
                   <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tight">Qual a sua Unidade?</h2>
                   <p className="text-sm text-gray-400 font-medium">Selecione onde o consumo será realizado.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {enterprises.map(ent => (
                     <label key={ent.id} onClick={() => setGuardianData({...guardianData, enterpriseId: ent.id})} className={`flex items-center justify-between p-8 rounded-[32px] border-2 transition-all cursor-pointer group hover:shadow-xl ${guardianData.enterpriseId === ent.id ? 'border-indigo-600 bg-indigo-50 shadow-2xl' : 'border-gray-100 bg-white'}`}>
                        <div className="flex items-center gap-6">
                           <div className={`w-16 h-16 rounded-[20px] flex items-center justify-center font-black text-2xl shadow-inner ${guardianData.enterpriseId === ent.id ? 'bg-indigo-600 text-white scale-110' : 'bg-gray-100 text-gray-300'}`}>{ent.name.charAt(0)}</div>
                           <div>
                              <p className="text-lg font-black text-gray-800 uppercase tracking-tight leading-none mb-1">{ent.name}</p>
                              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                 <MapPin size={12} className="text-indigo-400" /> {ent.address.split(',')[0]}
                              </div>
                           </div>
                        </div>
                        {guardianData.enterpriseId === ent.id && <CheckCircle2 className="text-indigo-600" size={32} />}
                     </label>
                   ))}
                </div>
             </div>
           )}

           {step === 3 && (
             <div className="space-y-12 animate-in slide-in-from-right-4">
                {registeredStudents.length > 0 && (
                  <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 flex items-center justify-between animate-in zoom-in-95">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Users size={24} /></div>
                       <div>
                          <p className="text-xs font-black text-emerald-800 uppercase">Dependentes salvos:</p>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase mt-0.5">{registeredStudents.map(s => s.name.split(' ')[0]).join(', ')}</p>
                       </div>
                    </div>
                    <span className="bg-white px-4 py-2 rounded-xl text-xs font-black text-emerald-600 border border-emerald-100">{registeredStudents.length} Dependente(s)</span>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                   <div className="lg:col-span-5 space-y-6">
                      <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                        <GraduationCap size={16}/> {regType === 'ALUNO' ? `Dados do Aluno ${registeredStudents.length + 1}` : 'Identificação do Colaborador'}
                      </h3>
                      
                      {/* SELETOR DE AVATAR */}
                      <div className="space-y-4">
                         <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Escolha uma Identidade Visual Sorridente *</label>
                         <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide">
                            {AVATAR_SEEDS.map((av) => {
                               const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${av.seed}&mouth=smile&backgroundColor=b6e3f4,c0aede,d1d4f9`;
                               const isSelected = currentStudent.photo === url;
                               return (
                                  <button 
                                     key={av.id}
                                     type="button"
                                     onClick={() => setCurrentStudent({ ...currentStudent, photo: url })}
                                     className={`relative shrink-0 w-16 h-16 rounded-2xl border-4 transition-all hover:scale-105 active:scale-95 shadow-sm ${isSelected ? 'border-indigo-600 ring-4 ring-indigo-100 bg-white' : 'border-gray-100 bg-gray-50 grayscale hover:grayscale-0'}`}
                                  >
                                     <img src={url} alt="Avatar Jovem" className="w-full h-full object-cover rounded-xl" />
                                     {isSelected && (
                                        <div className="absolute -top-2 -right-2 bg-indigo-600 text-white p-0.5 rounded-full shadow-lg border-2 border-white">
                                           <Check size={10} strokeWidth={4} />
                                        </div>
                                     )}
                                  </button>
                               );
                            })}
                         </div>
                         <div className="flex items-center justify-between px-1">
                            <span className="text-[8px] font-black text-gray-300 uppercase">← Deslize para escolher →</span>
                            <span className="text-[8px] font-black text-indigo-400 uppercase">Expressão: Feliz / Jovem</span>
                         </div>
                      </div>

                      <div className="space-y-4">
                         <InputField label="Nome Completo *" value={currentStudent.name} onChange={(v:any)=>setCurrentStudent({...currentStudent, name:v})} placeholder="Sem abreviações" />
                         {regType === 'ALUNO' && (
                           <div className="grid grid-cols-2 gap-4">
                              <InputField label="Ano / Série *" value={currentStudent.grade} onChange={(v:any)=>setCurrentStudent({...currentStudent, grade:v})} placeholder="Ex: 5º Ano" />
                              <InputField label="Turma *" value={currentStudent.class} onChange={(v:any)=>setCurrentStudent({...currentStudent, class:v})} placeholder="Ex: A" />
                           </div>
                         )}
                         <InputField label="Nº de Matrícula (Opcional)" value={currentStudent.registrationId} onChange={(v:any)=>setCurrentStudent({...currentStudent, registrationId:v})} placeholder="Código interno" />
                      </div>
                   </div>

                   <div className={`lg:col-span-7 space-y-6 ${registeredStudents.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                      <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2"><UserCircle size={16}/> {regType === 'ALUNO' ? 'Responsável Financeiro' : 'Dados Adicionais'}</h3>
                      <div className="bg-indigo-50/50 p-8 rounded-[40px] border border-indigo-100 space-y-6 relative overflow-hidden">
                         {registeredStudents.length > 0 && (
                            <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] flex items-center justify-center z-10">
                               <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-xl">
                                  <ShieldCheck size={16} /> Dados Preservados
                               </div>
                            </div>
                         )}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputField label={regType === 'ALUNO' ? "Nome do Responsável *" : "Nome Completo *"} value={guardianData.name} onChange={(v:any)=>setGuardianData({...guardianData, name:v})} placeholder="Nome conforme documento" />
                            <InputField label="CPF *" value={guardianData.cpf} onChange={(v:any)=>setGuardianData({...guardianData, cpf:v})} placeholder="000.000.000-00" />
                            <InputField label="WhatsApp *" value={guardianData.phone} onChange={(v:any)=>setGuardianData({...guardianData, phone:v})} placeholder="(00) 00000-0000" />
                            <InputField label="E-mail *" value={guardianData.email} onChange={(v:any)=>setGuardianData({...guardianData, email:v})} placeholder="exemplo@email.com" />
                         </div>
                      </div>
                   </div>
                </div>
             </div>
           )}
        </div>

        <div className="p-8 bg-gray-50 border-t flex items-center justify-between gap-6 shrink-0 shadow-[0_-15px_45px_rgba(0,0,0,0.05)]">
           <button onClick={() => step > 1 ? prevStep() : window.history.back()} className="flex items-center gap-3 px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[3px] hover:text-indigo-600 transition-all group">
              <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Voltar
           </button>
           
           <div className="flex-1 flex justify-end gap-4">
              {step === 3 ? (
                <button 
                  disabled={!currentStudent.name || (registeredStudents.length === 0 && (!guardianData.name || !guardianData.cpf))}
                  onClick={handleSaveAndAskNext}
                  className="bg-indigo-600 text-white px-10 py-6 rounded-[28px] font-black uppercase text-xs tracking-[3px] shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-30"
                >
                  Confirmar Dados <ArrowRight size={22} />
                </button>
              ) : (
                <button 
                  disabled={(step === 2 && !guardianData.enterpriseId)}
                  onClick={nextStep}
                  className="bg-indigo-600 text-white px-12 py-6 rounded-[28px] font-black uppercase text-xs tracking-[3px] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
                >
                   Próxima Etapa <ArrowRight size={22} />
                </button>
              )}
           </div>
        </div>
      </div>

      {showDecisionModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md"></div>
           <div className="relative w-full max-w-lg bg-white rounded-[48px] shadow-2xl p-12 text-center space-y-10 animate-in zoom-in-95">
              <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[32px] flex items-center justify-center mx-auto shadow-inner"><Users size={48} /></div>
              <div className="space-y-4">
                 <h3 className="text-3xl font-black text-gray-800 uppercase tracking-tight leading-none">Registro Efetuado!</h3>
                 <p className="text-gray-500 font-medium leading-relaxed">
                   O cadastro de <b>{registeredStudents[registeredStudents.length - 1]?.name.split(' ')[0]}</b> foi salvo com sucesso. <br/>O que deseja fazer agora?
                 </p>
              </div>
              <div className="flex flex-col gap-4">
                 <button onClick={handleAddAnother} className="w-full py-5 rounded-[24px] bg-indigo-50 text-indigo-600 font-black uppercase tracking-[2px] text-xs hover:bg-indigo-100 border-2 border-indigo-100 transition-all flex items-center justify-center gap-2">
                    <Plus size={18}/> Adicionar Aluno {registeredStudents.length + 1}
                 </button>
                 <button onClick={handleFinish} className="w-full py-6 rounded-[24px] bg-indigo-600 text-white font-black uppercase tracking-[2px] text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-3 transition-all">
                    Finalizar e Ir para o Portal <CheckCircle2 size={20}/>
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

const InputField = ({ label, value, onChange, placeholder, type = "text", required = false }: any) => (
  <div className="space-y-2 text-left">
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
    <input 
      type={type}
      required={required}
      value={value} 
      onChange={e => onChange(e.target.value)} 
      placeholder={placeholder}
      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-[20px] outline-none font-bold text-sm transition-all shadow-inner" 
    />
  </div>
);

export default RegistrationPage;
