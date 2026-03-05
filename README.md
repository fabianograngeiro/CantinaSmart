# CantinaSmart

Sistema de gestão para cantina escolar com:
- `PDV`
- `Clientes`
- `Produtos`
- `Planos`
- `Transações`
- `Financeiro`
- `Entrega do Dia`

## Estrutura

- `./` frontend (React + Vite)
- `./backend` backend (Node + Express)
- `./backend/data/database.json` base de dados local
- `./tools/local-print-agent.mjs` agente local de impressão de cupom

## Requisitos

- Node.js 20+
- npm
- (Linux) CUPS para impressão local (`lp`, `lpstat`)

## Configuração de ambiente

No frontend, crie `.env` na raiz usando o exemplo:

```bash
cp .env.example .env
```

Exemplo:

```env
VITE_API_URL=http://localhost:3001/api
```

No backend, se necessário:

```bash
cp backend/.env.example backend/.env
```

## Instalação

Frontend:

```bash
npm install
```

Backend:

```bash
cd backend
npm install
```

## Rodar em desenvolvimento

Terminal 1 (backend):

```bash
cd backend
npm run dev
```

Terminal 2 (frontend):

```bash
npm run dev
```

Frontend padrão: `http://localhost:5173`  
Backend padrão: `http://localhost:3001`

## Build

Frontend:

```bash
npm run build
```

Backend:

```bash
cd backend
npm run build
```

## Impressão de cupom (Agente Local)

Para imprimir no computador do caixa (Windows 10/11, Ubuntu/Linux):

```bash
npm run print-agent
```

Agente local padrão: `http://127.0.0.1:18181`

No sistema:
1. `Ajustes > Impressão`
2. Modo: `Agente Local`
3. URL: `http://127.0.0.1:18181`
4. `Testar/Atualizar`
5. `Ativar padrão do computador`
6. Salvar

## Scripts úteis (frontend)

- `npm run dev` inicia frontend
- `npm run build` build de produção
- `npm run preview` pré-visualização do build
- `npm run lint` checagem TypeScript
- `npm run print-agent` inicia agente local de impressão

## Scripts úteis (backend)

- `npm run dev` inicia backend em desenvolvimento
- `npm run build` compila TypeScript
- `npm run start` inicia backend

