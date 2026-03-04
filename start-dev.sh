#!/bin/bash

# Script para rodar o CantinaSmart com backend e frontend

echo "🚀 Iniciando CantinaSmart..."

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para limpar processos ao sair
cleanup() {
  echo -e "\n${BLUE}Encerrando serviços...${NC}"
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  exit 0
}

trap cleanup EXIT INT TERM

# 1. Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}Instalando dependências do frontend...${NC}"
  npm install
fi

if [ ! -d "backend/node_modules" ]; then
  echo -e "${BLUE}Instalando dependências do backend...${NC}"
  cd backend
  npm install
  cd ..
fi

# 2. Rodar o backend
echo -e "${GREEN}✓ Iniciando backend na porta 3001...${NC}"
cd backend
npx tsx server.ts > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Esperar o backend iniciar
sleep 2

# 3. Rodar o frontend
echo -e "${GREEN}✓ Iniciando frontend na porta 5173...${NC}"
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

# Esperar um pouco para inicialização
sleep 3

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}CantinaSmart está rodando!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${BLUE}Frontend:${NC}  http://localhost:5173"
echo -e "${BLUE}Backend:${NC}   http://localhost:3001/api"
echo ""
echo -e "${BLUE}Credenciais de teste:${NC}"
echo "  Email: dono@grupo.com"
echo "  Senha: 123456"
echo ""
echo -e "Para ver os logs:"
echo "  Backend:  tail -f /tmp/backend.log"
echo "  Frontend: tail -f /tmp/frontend.log"
echo ""
echo -e "Pressione Ctrl+C para encerrar todos os serviços"
echo -e "${GREEN}======================================${NC}\n"

# Manter os processos rodando
wait
