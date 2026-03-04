#!/bin/bash

# Quick Start Guide for CantinaSmart Security Testing

echo "======================================"
echo "🔐 CantinaSmart Security Setup"
echo "======================================"
echo ""

# Step 1: Navigate to backend
echo "Step 1: Navigate to backend directory..."
cd backend || exit

# Step 2: Check if .env exists
echo "Step 2: Checking environment setup..."
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo "⚠️  Please edit .env and set a strong JWT_SECRET"
else
    echo "✅ .env file already exists"
fi

echo ""

# Step 3: Install dependencies
echo "Step 3: Installing dependencies..."
npm install
if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""

# Step 4: Build TypeScript
echo "Step 4: Building TypeScript..."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi

echo ""

# Step 5: Instructions
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Start the backend server:"
echo "   npm start"
echo ""
echo "2. In another terminal, run the security tests:"
echo "   bash test-security.sh"
echo ""
echo "3. Read the documentation:"
echo "   - SECURITY.md (detailed explanation)"
echo "   - IMPLEMENTATION_SUMMARY.md (what was changed)"
echo ""
echo "4. Test endpoints manually with curl:"
echo "   curl -X POST http://localhost:3001/api/auth/register \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"test@example.com\",\"password\":\"TestPass123\",\"name\":\"Test\",\"role\":\"USER\"}'"
echo ""
